"""
Place search. Nominatim first (best for full names), Photon (komoot, OSM-based,
built for type-ahead / partial words) as fallback. Results are cached,
requests are throttled to Nominatim's 1 req/s policy, and transient failures
are retried - so a failure is reported as an error, never as "no results".
"""
import asyncio
import time
from fastapi import APIRouter, HTTPException, Query

from app.http_client import get_client

router = APIRouter(prefix="/api/places", tags=["places"])

HEADERS = {"User-Agent": "RouteSafe-AI/1.0 (route safety demo)", "Accept-Language": "en"}
_CACHE: dict = {}
CACHE_TTL_S = 6 * 3600
_nominatim_lock = asyncio.Lock()
_last_nominatim = 0.0


async def _nominatim(q: str, limit: int):
    global _last_nominatim
    async with _nominatim_lock:  # serialise + enforce >=1.1s spacing
        wait = 1.1 - (time.monotonic() - _last_nominatim)
        if wait > 0:
            await asyncio.sleep(wait)
        try:
            resp = await get_client().get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": q, "format": "jsonv2", "limit": limit,
                        "addressdetails": 1, "countrycodes": "in"},
                headers=HEADERS,
            )
        finally:
            _last_nominatim = time.monotonic()
    resp.raise_for_status()
    return [
        {"place_id": i.get("place_id"),
         "name": (i.get("display_name") or q).split(",")[0],
         "display_name": i.get("display_name", q),
         "lat": float(i["lat"]), "lon": float(i["lon"])}
        for i in resp.json() if i.get("lat") and i.get("lon")
    ]


async def _photon(q: str, limit: int):
    # bbox roughly covers India; Photon is tolerant of partial/misspelled words
    resp = await get_client().get(
        "https://photon.komoot.io/api/",
        params={"q": q, "limit": limit, "lang": "en",
                "bbox": "68.1,6.5,97.5,35.7"},
        headers=HEADERS,
    )
    resp.raise_for_status()
    out = []
    for f in resp.json().get("features", []):
        p, (lon, lat) = f.get("properties", {}), f["geometry"]["coordinates"][:2]
        parts = [p.get("name"), p.get("street"), p.get("district") or p.get("city"),
                 p.get("state"), p.get("country")]
        disp = ", ".join(x for x in parts if x) or q
        out.append({"place_id": f"photon-{p.get('osm_id')}",
                    "name": p.get("name") or disp.split(",")[0],
                    "display_name": disp, "lat": float(lat), "lon": float(lon)})
    return out


@router.get("/search")
async def search_places(q: str = Query(..., min_length=2), limit: int = Query(5, ge=1, le=10)):
    key = (q.strip().lower(), limit)
    hit = _CACHE.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
        return hit[1]

    last_err = None
    results = []
    for provider in (_nominatim, _photon):
        for attempt in range(2):  # one retry on transient errors
            try:
                results = await provider(q, limit)
                last_err = None
                break
            except Exception as e:
                last_err = e
                await asyncio.sleep(0.5)
        if results:
            break

    if not results and last_err is not None:
        raise HTTPException(status_code=502, detail=f"Place search failed: {last_err}")
    _CACHE[key] = (time.monotonic(), results)
    return results
