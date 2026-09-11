"""
Central configuration. All secrets are read from environment variables —
never hardcode API keys in source files.

Required environment variables (set these in a .env file, see .env.example):

OPENWEATHER_API_KEY   -> https://openweathermap.org/api  (free tier)
OPENAQ_API_KEY        -> https://docs.openaq.org/           (free, but v3 requires a key now)
ORS_API_KEY            -> https://openrouteservice.org/dev/#/signup (free tier, 2000 req/day)
"""

import os
from dotenv import load_dotenv

load_dotenv()  # reads a local .env file if present


class Settings:
    OPENWEATHER_API_KEY: str = os.getenv("OPENWEATHER_API_KEY", "")
    OPENAQ_API_KEY: str = os.getenv("OPENAQ_API_KEY", "")
    ORS_API_KEY: str = os.getenv("ORS_API_KEY", "")

    # Grid resolution for spatial bucketing (in degrees, ~0.005 = ~500m)
    GRID_CELL_SIZE: float = 0.005

    # How many candidate routes to request from the routing engine
    NUM_ROUTE_ALTERNATIVES: int = 3

    # CORS - update with your deployed frontend URL in production.
    # The capacitor:// and https://localhost entries are the origins
    # Capacitor's native WebView sends on iOS and Android respectively —
    # needed once you package this as a mobile app, in addition to your
    # regular deployed website URL.
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",   # local Vite dev server
        "http://localhost:3000",
        "capacitor://localhost",   # iOS app (Capacitor)
        "https://localhost",       # Android app (Capacitor, androidScheme: "https")
        "*",  # tighten this before going to production
    ]


settings = Settings()
