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
from app.crime_cache import get_crime_cache

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
            waypoints=waypoint_pairs,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Routing service failed: {e}")

    if not raw_routes:
        raise HTTPException(status_code=404, detail="No routes found between these points.")

    # 2. Ensure the crime hotspot grid is available (shared cache, built once)
    cache = await get_crime_cache()
    crime_grid = cache["grid"]

    # 3. For each route, sample points and fetch AQI + estimate crime + traffic
    weights = {
        "aqi": req.weight_aqi,
        "crime": req.weight_crime,
        "traffic": req.weight_traffic,
    }

    profiles = []
    districts_by_route = {}
    for idx, route in enumerate(raw_routes):
        sampled_points = routing_service.sample_route_points(route["geometry"], every_n=8)
        segment_risks, districts_touched = await _score_segments(
            sampled_points, route["duration_s"], crime_grid
        )
        profile = risk_fusion.score_route(
            route_index=idx,
            distance_m=route["distance_m"],
            duration_s=route["duration_s"],
            segment_risks=segment_risks,
            mode=req.mode,
            weights=weights,
        )
        profiles.append((profile, route["geometry"]))
        districts_by_route[idx] = sorted(districts_touched)

    # 4. Rank
    if req.ranking == "pareto":
        ranked_profiles = risk_fusion.pareto_optimal_routes([p for p, _ in profiles])
    else:
        ranked_profiles = risk_fusion.rank_by_weighted_sum([p for p, _ in profiles])

    geometry_by_index = {p.route_index: g for p, g in profiles}

    # 5. Build response
    results = []
    for profile in ranked_profiles:
        results.append({
            "route_index": profile.route_index,
            "geometry": geometry_by_index[profile.route_index],
            "distance_km": round(profile.distance_m / 1000, 2),
            "duration_min": round(profile.duration_s / 60, 1),
            "avg_aqi": profile.avg_aqi,
            "max_crime_score": profile.max_crime_score,
            "avg_crime_score": profile.avg_crime_score,
            "avg_traffic_delay": profile.avg_traffic_delay,
            "composite_score": profile.composite_score,
            "advisory": risk_fusion.generate_advisory_text(profile),
            "districts_traversed": districts_by_route[profile.route_index],
            "crime_data_source": "Tamil Nadu Police (real district rates) + rate-anchored synthetic street-level detail",
        })

    return {
        "routes": results,
        "ranking_method": req.ranking,
        "mode": req.mode,
        "waypoints_used": [{"lat": lat, "lon": lon} for lat, lon in waypoint_pairs],
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
    districts_touched = set()
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
        crime_score = crime_result["risk_score"]
        districts_touched.add(crime_result["district"])

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

    return segment_risks, districts_touched
