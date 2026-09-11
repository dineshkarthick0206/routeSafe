"""
Live Weather Service — OpenWeatherMap current-conditions API.
Docs: https://openweathermap.org/current
Free tier: 1,000 calls/day, 60 calls/min.
"""

import httpx
from app.config import settings
from app.http_client import get_client

OWM_BASE_URL = "https://api.openweathermap.org/data/2.5/weather"


async def get_weather_for_point(lat: float, lon: float) -> dict:
    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.OPENWEATHER_API_KEY,
        "units": "metric",
    }
    client = get_client()
    resp = await client.get(OWM_BASE_URL, params=params)
    resp.raise_for_status()
    data = resp.json()

    return {
        "temp_c": data["main"]["temp"],
        "humidity": data["main"]["humidity"],
        "wind_speed_ms": data["wind"]["speed"],
        "condition": data["weather"][0]["main"],
        "description": data["weather"][0]["description"],
        "rain_1h_mm": data.get("rain", {}).get("1h", 0.0),
    }
