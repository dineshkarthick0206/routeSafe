"""
Main API router — this is what the React frontend calls.

POST /api/routes/safe-route
  body: { start_lat, start_lon, end_lat, end_lon, waypoints?, mode, weights? }
  returns: ranked list of candidate routes with full risk breakdowns
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import asyncio

from app.services import routing_service, aqi_service, weather_service, risk_fusion
from app.ml import crime_hotspot_model
from app.data import tn_crime_data
from app.config import settings
from app.crime_cache import get_crime_cache

ROUTE_TIMEOUT_S = 30  # per-route scoring budget

router = APIRouter(prefix="/api/routes", tags=["routes"])


class LatLon(BaseModel):
    lat: float
    lon: float


class RouteRequest(BaseModel):
    start_lat: float
    start_lon: float
    end_lat: float
    end_lon: float
    waypoints: List[LatLon] = []  # optional in-between stops, visited in order
    mode: str = "car"  # "car" | "two_wheeler" | "walking"
    weight_aqi: float = 0.33
    weight_crime: float = 0.34
    weight_traffic: float = 0.33
    ranking: str = "weighted"  # "weighted" | "pareto"


@router.post("/safe-route")
async def get_safe_routes(req: RouteRequest):
    waypoint_pairs = [(wp.lat, wp.lon) for wp in req.waypoints]

    # 1. Get candidate routes from the routing engine
    try:
        raw_routes = await routing_service.get_routes(
            req.start_lat, req.start_lon, req.end_lat, req.end_lon,
            waypoints=waypoint_pairs, mode=req.mode,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing service failed: {e}")

    if not raw_routes:
        raise HTTPException(status_code=404, detail="No routes found between these points.")

    # 2. Ensure the crime hotspot grid is available (shared cache, built once)
    cache = await get_crime_cache()
    crime_grid = cache["grid"]

    tn_crime_data.load()
    crime_meta = tn_crime_data.meta()
    fallback_crime = crime_meta["median_index"] * 100  # only used if a route has no crime data at all

    # 3. For each route, sample points and fetch AQI + estimate crime + traffic
    weights = {
        "aqi": req.weight_aqi,
        "crime": req.weight_crime,
        "traffic": req.weight_traffic,
    }

    # Score all candidate routes concurrently. Each route gets a time budget;
    # a slow route is dropped so the others still come back.
    async def _score_one(idx, route):
        sampled_points = routing_service.sample_route_points(route["geometry"])
        segment_risks, districts_touched, unit_stats = await asyncio.wait_for(
            _score_segments(sampled_points, route["duration_s"], crime_grid),
            timeout=ROUTE_TIMEOUT_S,
        )
        profile = risk_fusion.score_route(
            route_index=idx,
            distance_m=route["distance_m"],
            duration_s=route["duration_s"],
            segment_risks=segment_risks,
            mode=req.mode,
            weights=weights,
            fallback_crime=fallback_crime,
        )
        return profile, route["geometry"], unit_stats

    outcomes = await asyncio.gather(
        *[_score_one(i, r) for i, r in enumerate(raw_routes)],
        return_exceptions=True,
    )
    profiles = []
    districts_by_route = {}
    for idx, out in enumerate(outcomes):
        if isinstance(out, BaseException):
            continue  # timed-out / failed route is dropped
        profile, geometry, unit_stats = out
        profiles.append((profile, geometry))
        districts_by_route[idx] = unit_stats

    if not profiles:
        raise HTTPException(
            status_code=504,
            detail=f"Route analysis timed out (>{ROUTE_TIMEOUT_S}s per route). "
                   "Air-quality data is slow right now - please try again.",
        )

    # 4. Rank
    if req.ranking == "pareto":
        ranked_profiles = risk_fusion.pareto_optimal_routes([p for p, _ in profiles])
    else:
        ranked_profiles = risk_fusion.rank_by_weighted_sum([p for p, _ in profiles])

    geometry_by_index = {p.route_index: g for p, g in profiles}

    # 5. Build response
    results = []
    street_w = settings.STREET_LAYER_WEIGHT
    for profile in ranked_profiles:
        unit_stats = districts_by_route[profile.route_index]
        n_points = unit_stats["n_points"]
        covered = unit_stats["covered_points"]
        breakdown = [
            {"unit": u["unit"], "year": u["year"], "ipc_crime_rate": u["ipc_crime_rate"],
             "crime_index": u["crime_index"], "share": round(u["points"] / n_points, 2)}
            for u in unit_stats["units"]
        ]
        results.append({
            "route_index": profile.route_index,
            "geometry": geometry_by_index[profile.route_index],
            "distance_km": round(profile.distance_m / 1000, 2),
            "duration_min": round(profile.duration_s / 60, 1),
            "avg_aqi": profile.avg_aqi,
            # crime scores are returned on a 0-1 scale (internally 0-100)
            "max_crime_score": round(profile.max_crime_score / 100, 3),
            "avg_crime_score": round(profile.avg_crime_score / 100, 3),
            "avg_traffic_delay": profile.avg_traffic_delay,
            "composite_score": profile.composite_score,
            "mode": req.mode,
            "routing_profile": raw_routes[profile.route_index].get("profile"),
            "advisory": risk_fusion.generate_advisory_text(profile) + (
                " No Tamil Nadu crime data covers this route, so a state-median value was used for crime."
                if covered == 0 else ""),
            "districts_traversed": [b["unit"] for b in breakdown],
            "crime_breakdown": breakdown,
            "crime_coverage": round(covered / n_points, 2) if n_points else 0,
            "crime_data_source": (
                f"Tamil Nadu Police district crime rates {crime_meta['reference_year']} "
                f"({crime_meta['source_csv']})"
                + (f" + rate-anchored synthetic street-level layer (weight {street_w:.0%})" if street_w > 0 else "")
            ),
            "risk_data_status": "crime_csv_district_data" + (";street_layer_synthetic" if street_w > 0 else "") + ";aqi_openaq_or_default;traffic_not_live",
        })

    return {
        "routes": results,
        "ranking_method": req.ranking,
        "mode": req.mode,
        "waypoints_used": [{"lat": lat, "lon": lon} for lat, lon in waypoint_pairs],
        "crime_reference_year": crime_meta["reference_year"],
    }


async def _score_segments(sampled_points, total_duration_s, crime_grid):
    """
    For each sampled point along a route, fetch/estimate AQI and crime risk.
    AQI calls are made concurrently to keep latency reasonable.
    """
    n_points = len(sampled_points)
    aqi_tasks = [
        aqi_service.get_aqi_for_point(lat, lon) for lat, lon in sampled_points
    ]
    aqi_results = await asyncio.gather(*aqi_tasks, return_exceptions=True)

    segment_risks = []
    units: dict = {}  # insertion order = order first met along the route
    now = datetime.utcnow()
    for i, (lat, lon) in enumerate(sampled_points):
        # Estimate ETA at this point (linear interpolation along route duration)
        fraction = i / max(1, n_points - 1)
        eta = now + timedelta(seconds=total_duration_s * fraction)

        aqi_result = aqi_results[i]
        aqi_value = (
            aqi_result["aqi"] if isinstance(aqi_result, dict) and aqi_result.get("aqi")
            else 60  # neutral fallback if no station nearby
        )

        crime_result = crime_hotspot_model.get_risk_for_point(
            crime_grid, lat, lon, eta.hour
        )
        crime_score = crime_result["risk_score"]  # None outside Tamil Nadu
        if crime_score is not None:
            u = units.setdefault(crime_result["district"], {
                "unit": crime_result["district"], "points": 0,
                "crime_index": crime_result["crime_index"],
                "ipc_crime_rate": crime_result["ipc_crime_rate"],
                "year": crime_result["year"],
            })
            u["points"] += 1

        # Simple traffic delay proxy: OSRM's duration already reflects live-ish
        # conditions on the demo server; a production system would call a
        # dedicated traffic API per segment. We approximate delay factor as 1.0
        # here and note this as a known simplification.
        traffic_delay_factor = 1.0

        segment_risks.append(risk_fusion.SegmentRisk(
            lat=lat, lon=lon, eta=eta,
            aqi=aqi_value, crime_score=crime_score,
            traffic_delay_factor=traffic_delay_factor,
        ))

    unit_stats = {
        "units": list(units.values()),
        "n_points": n_points,
        "covered_points": sum(u["points"] for u in units.values()),
    }
    return segment_risks, set(units), unit_stats
