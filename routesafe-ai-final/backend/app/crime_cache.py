"""
Shared in-memory cache for the Tamil Nadu crime dataset.

Both the route-scoring endpoint (route_router.py) and the crime-map
endpoints (crime_router.py) need the SAME underlying synthetic incident
data and DBSCAN clustering, so this is computed once, cached, and shared —
rather than each endpoint building its own (which would risk them
disagreeing about which points are "hotspots").

For a production deployment, replace this in-memory cache with a
scheduled job (APScheduler / cron) that rebuilds every few hours and
persists to a small SQLite file — the rest of the code doesn't need to
change, since everything reads through get_crime_cache().
"""

import asyncio
from app.ml import crime_hotspot_model

_cache = {"incidents": None, "clustered": None, "grid": None, "built_at": None}
_build_lock = asyncio.Lock()


async def get_crime_cache():
    """Returns {'incidents': df, 'clustered': df, 'grid': df, 'built_at': datetime}."""
    if _cache["grid"] is not None:
        return _cache

    async with _build_lock:
        if _cache["grid"] is not None:  # re-check after acquiring lock
            return _cache

        incidents = crime_hotspot_model.generate_rate_anchored_synthetic_points()
        clustered = crime_hotspot_model.run_st_dbscan(incidents)
        grid = crime_hotspot_model.build_hotspot_grid(clustered)

        _cache["incidents"] = incidents
        _cache["clustered"] = clustered
        _cache["grid"] = grid
        import datetime
        _cache["built_at"] = datetime.datetime.utcnow()

    return _cache
