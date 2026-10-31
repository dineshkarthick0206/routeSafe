"""
Crime map API — powers the heatmap, cluster markers, individual incident
markers, and hotspot boundary polygons on the frontend map, plus the
spatio-temporal time slider (filter by month and/or hour-of-day range).

GET /api/crime/heatmap?month=3&hour_min=18&hour_max=23
  Returns individual incidents (for heatmap/markers) and hotspot boundary
  polygons (for the shaded zones), both filtered to the given time window.
  Omit month / hour_min+hour_max to see all-time / all-hours data.
"""

from fastapi import APIRouter, Query
from typing import Optional

from fastapi import HTTPException
from app.ml import crime_hotspot_model
from app.data import tn_crime_data
from app.crime_cache import get_crime_cache

router = APIRouter(prefix="/api/crime", tags=["crime"])

MAX_INCIDENTS_RETURNED = 3000

DATA_HONESTY_NOTE = (
    "District-level risk (used for route scoring) comes from the Tamil Nadu "
    "Police crime-rate CSV supplied with this project. The individual incident "
    "points, hotspot boundaries, and dates/times on the map are synthetic, "
    "statistically anchored to those district rates and their theft / robbery / "
    "burglary mix - not actual incident records."
)


@router.get("/heatmap")
async def get_crime_heatmap(
    month: Optional[int] = Query(None, ge=1, le=12, description="1=Jan .. 12=Dec, omit for all months"),
    hour_min: Optional[int] = Query(None, ge=0, le=23),
    hour_max: Optional[int] = Query(None, ge=0, le=23),
):
    cache = await get_crime_cache()
    clustered = cache["clustered"]

    filtered = crime_hotspot_model.filter_incidents(
        clustered, month=month, hour_min=hour_min, hour_max=hour_max
    )

    hotspots = crime_hotspot_model.compute_hotspot_boundaries(filtered)

    incidents_df = filtered.sort_values("date", ascending=False).head(MAX_INCIDENTS_RETURNED)
    incidents = [
        {
            "id": row["id"],
            "lat": round(float(row["latitude"]), 6),
            "lon": round(float(row["longitude"]), 6),
            "district": row["district"],
            "crime_type": row["crime_type"],
            "severity": row["severity"],
            "severity_weight": crime_hotspot_model.SEVERITY_WEIGHT.get(row["severity"], 0.5),
            "date": row["date"],
            "hour": int(row["hour"]),
        }
        for _, row in incidents_df.iterrows()
    ]

    return {
        "filter": {"month": month, "hour_min": hour_min, "hour_max": hour_max},
        "total_incidents": int(len(filtered)),
        "incidents_returned": len(incidents),
        "incidents": incidents,
        "hotspots": hotspots,
        "data_honesty_note": DATA_HONESTY_NOTE,
    }


@router.get("/meta")
async def get_crime_meta():
    """Small helper endpoint so the frontend can show data freshness / totals."""
    cache = await get_crime_cache()
    incidents = cache["incidents"]
    return {
        **tn_crime_data.meta(),
        "total_incidents": int(len(incidents)),
        "districts_covered": int(incidents["district"].nunique()),
        "built_at": cache["built_at"].isoformat() if cache["built_at"] else None,
        "data_honesty_note": DATA_HONESTY_NOTE,
    }


@router.get("/units")
async def get_crime_units():
    """All scored police units from the CSV, highest crime index first."""
    return tn_crime_data.all_units()


@router.get("/point")
async def get_crime_point(lat: float = Query(...), lon: float = Query(...)):
    """CSV-based district risk for one coordinate (handy for checking unit assignment)."""
    result = crime_hotspot_model.get_district_risk_score(lat, lon)
    if result["risk_score"] is None:
        raise HTTPException(404, "No crime data for this location (outside Tamil Nadu coverage).")
    return result
