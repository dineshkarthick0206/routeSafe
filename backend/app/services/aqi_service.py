"""
Live Air Quality Service — pulls current PM2.5/PM10/NO2 readings from OpenAQ v3.

OpenAQ docs: https://docs.openaq.org/using-the-api/quick-start
Sign up for a free API key at https://explore.openaq.org/ (account settings -> API keys).
"""

import httpx
from app.config import settings
from app.http_client import get_client

OPENAQ_BASE_URL = "https://api.openaq.org/v3"


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
    client = get_client()
    resp = await client.get(url, headers=headers, params=params)
    resp.raise_for_status()
    return resp.json().get("results", [])


async def get_latest_measurement(location_id: int):
    """Get the most recent sensor readings for a specific station."""
    url = f"{OPENAQ_BASE_URL}/locations/{location_id}/latest"
    headers = {"X-API-Key": settings.OPENAQ_API_KEY}
    client = get_client()
    resp = await client.get(url, headers=headers)
    resp.raise_for_status()
    return resp.json().get("results", [])


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
