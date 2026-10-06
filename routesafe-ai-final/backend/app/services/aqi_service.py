"""
Live Air Quality Service — pulls current PM2.5/PM10/NO2 readings from OpenAQ v3.

OpenAQ docs: https://docs.openaq.org/using-the-api/quick-start
Sign up for a free API key at https://explore.openaq.org/ (account settings -> API keys).
"""

import asyncio
import time
import httpx
from app.config import settings
from app.http_client import get_client

OPENAQ_BASE_URL = "https://api.openaq.org/v3"

# OpenAQ's free tier allows ~60 requests/min: cap concurrent calls.
_OPENAQ_SEMAPHORE = asyncio.Semaphore(8)

# Caches: stations by ~11km grid cell (lat/lon rounded to 1 decimal), latest
# measurements by station id. Neighbouring route points and repeat searches
# then cost zero extra API calls.
_STATION_CACHE: dict = {}
_MEASURE_CACHE: dict = {}
STATION_TTL_S = 24 * 3600
MEASURE_TTL_S = 10 * 60


_INFLIGHT: dict = {}


async def _dedupe(key, factory):
    """Concurrent callers asking for the same key share one in-flight request."""
    task = _INFLIGHT.get(key)
    if task is None:
        task = asyncio.ensure_future(factory())
        _INFLIGHT[key] = task
        task.add_done_callback(lambda _t: _INFLIGHT.pop(key, None))
    return await task


def _fresh(entry, ttl):
    return entry is not None and (time.monotonic() - entry[0]) < ttl


async def get_nearby_stations(lat: float, lon: float, radius_m: int = 15000):
    """
    Find OpenAQ monitoring stations (locations) near a coordinate.
    radius_m: search radius in meters (max 25000 for OpenAQ v3).
    """
    url = f"{OPENAQ_BASE_URL}/locations"
    headers = {"X-API-Key": settings.OPENAQ_API_KEY}
    params = {
        "coordinates": f"{lat},{lon}",
        "radius": radius_m,
        "limit": 10,
        "order_by": "id",
    }
    key = (round(lat, 1), round(lon, 1), radius_m)
    cached = _STATION_CACHE.get(key)
    if _fresh(cached, STATION_TTL_S):
        return cached[1]
    async def _fetch():
        async with _OPENAQ_SEMAPHORE:
            resp = await get_client().get(url, headers=headers, params=params)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        _STATION_CACHE[key] = (time.monotonic(), results)
        return results

    return await _dedupe(("st", key), _fetch)


async def get_latest_measurement(location_id: int):
    """Get the most recent sensor readings for a specific station."""
    url = f"{OPENAQ_BASE_URL}/locations/{location_id}/latest"
    headers = {"X-API-Key": settings.OPENAQ_API_KEY}
    cached = _MEASURE_CACHE.get(location_id)
    if _fresh(cached, MEASURE_TTL_S):
        return cached[1]
    async def _fetch():
        async with _OPENAQ_SEMAPHORE:
            resp = await get_client().get(url, headers=headers)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        _MEASURE_CACHE[location_id] = (time.monotonic(), results)
        return results

    return await _dedupe(("m", location_id), _fetch)


def pm25_to_aqi(pm25: float) -> int:
    """
    Convert raw PM2.5 concentration (µg/m³) to the US EPA AQI scale (0-500).
    Uses the standard EPA piecewise-linear breakpoint formula.
    """
    breakpoints = [
        (0.0, 12.0, 0, 50),
        (12.1, 35.4, 51, 100),
        (35.5, 55.4, 101, 150),
        (55.5, 150.4, 151, 200),
        (150.5, 250.4, 201, 300),
        (250.5, 350.4, 301, 400),
        (350.5, 500.4, 401, 500),
    ]
    for c_low, c_high, aqi_low, aqi_high in breakpoints:
        if c_low <= pm25 <= c_high:
            return round(
                ((aqi_high - aqi_low) / (c_high - c_low)) * (pm25 - c_low) + aqi_low
            )
    return 500  # cap at hazardous


async def get_aqi_for_point(lat: float, lon: float) -> dict:
    """
    Main entry point: given a coordinate, find the nearest station and
    return a simplified AQI reading. Falls back gracefully if no station
    is nearby.
    """
    stations = await get_nearby_stations(lat, lon)
    if not stations:
        return {"aqi": None, "pm25": None, "source": "no_station_nearby"}

    station = stations[0]
    location_id = station["id"]
    measurements = await get_latest_measurement(location_id)

    pm25_value = None
    for m in measurements:
        if m.get("parameter", {}).get("name") == "pm25":
            pm25_value = m.get("value")
            break

    if pm25_value is None:
        return {"aqi": None, "pm25": None, "source": station.get("name")}

    return {
        "aqi": pm25_to_aqi(pm25_value),
        "pm25": pm25_value,
        "source": station.get("name"),
        "station_lat": station["coordinates"]["latitude"],
        "station_lon": station["coordinates"]["longitude"],
    }
