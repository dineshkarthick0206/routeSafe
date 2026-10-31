"""
Central configuration. All secrets are read from environment variables —
never hardcode API keys in source files.

Required environment variables (set these in a .env file, see .env.example):

OPENWEATHER_API_KEY   -> https://openweathermap.org/api  (free tier)
OPENAQ_API_KEY        -> https://docs.openaq.org/           (free, but v3 requires a key now)
ORS_API_KEY            -> https://openrouteservice.org/dev/#/signup (free tier, 2000 req/day)

Optional:
CRIME_CSV_PATH         -> path to a different crime-rate CSV (default: app/data/TN_district_crime_rates_2016_2023.csv)
STREET_LAYER_WEIGHT    -> 0..1, weight of the street-level layer in crime scoring (default 0.4; 0 = CSV district rates only)
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

    # Share of the per-point crime score that comes from the street-level
    # layer (synthetic points anchored to the CSV rates). The rest comes
    # straight from the CSV district rates. Set STREET_LAYER_WEIGHT=0 to score
    # on the CSV district data alone.
    STREET_LAYER_WEIGHT: float = min(1.0, max(0.0, float(os.getenv("STREET_LAYER_WEIGHT", "0.4"))))

    # How many candidate routes to request from the routing engine
    NUM_ROUTE_ALTERNATIVES: int = 3

    # CORS - update with your deployed frontend URL in production
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",   # local Vite dev server
        "http://localhost:3000",
        "*",  # tighten this before going to production
    ]


settings = Settings()
