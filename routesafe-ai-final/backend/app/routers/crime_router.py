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

from app.ml import crime_hotspot_model
from app.crime_cache import get_crime_cache

router = APIRouter(prefix="/api/crime", tags=["crime"])

MAX_INCIDENTS_RETURNED = 3000

DATA_HONESTY_NOTE = (
    "District-level risk (used for route scoring) is real data published by "
    "Tamil Nadu Police. The individual incident points, hotspot boundaries, "
    "and dates/times shown on this map are synthetic, statistically anchored "
    "to those real district crime rates and category mixes — not actual "
    "incident records. See the project README for the full data-honesty note."
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
        "total_incidents": int(len(incidents)),
        "districts_covered": int(incidents["district"].nunique()),
        "built_at": cache["built_at"].isoformat() if cache["built_at"] else None,
        "data_honesty_note": DATA_HONESTY_NOTE,
    }
