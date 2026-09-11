"""
AQI Forecast Model — short-horizon prediction of pollution trend.

Full Prophet training needs weeks of historical station data, which OpenAQ's
free tier doesn't hand you in bulk easily. For a working demo, we use a
lightweight, honest approach: fetch the last N hourly readings for a station
(OpenAQ supports historical `/measurements` queries) and fit a small Prophet
model on that short series to project the next few hours. This is a real,
legitimate forecasting technique — just note in your report that forecast
confidence is lower with a short training window; for a production system
you'd accumulate your own historical log over time (see `feature_store.py`
for the mechanism that does this automatically as the app runs).
"""

import pandas as pd
from prophet import Prophet
import httpx
from app.config import settings

OPENAQ_BASE_URL = "https://api.openaq.org/v3"


async def fetch_recent_pm25_series(location_id: int, hours_back: int = 72) -> pd.DataFrame:
    """Fetch recent hourly PM2.5 readings for a station to build a mini time series."""
    url = f"{OPENAQ_BASE_URL}/locations/{location_id}/measurements"
    headers = {"X-API-Key": settings.OPENAQ_API_KEY}
    params = {"parameter": "pm25", "limit": hours_back, "order_by": "datetime", "sort": "desc"}

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        results = resp.json().get("results", [])

    if not results:
        return pd.DataFrame(columns=["ds", "y"])

    df = pd.DataFrame([
        {"ds": r["period"]["datetimeFrom"]["utc"], "y": r["value"]}
        for r in results
    ])
    df["ds"] = pd.to_datetime(df["ds"]).dt.tz_localize(None)
    df = df.sort_values("ds").drop_duplicates(subset="ds")
    return df


def forecast_next_hours(df: pd.DataFrame, periods=6):
    """
    Fits Prophet on a short PM2.5 series and forecasts the next `periods` hours.
    Falls back to a simple persistence forecast if there isn't enough data
    for Prophet to fit meaningfully (Prophet needs at least ~2 data points,
    but produces poor results below ~10).
    """
    if len(df) < 10:
        if df.empty:
            return []
        last_val = df["y"].iloc[-1]
        last_time = df["ds"].iloc[-1]
        return [
            {"ds": (last_time + pd.Timedelta(hours=i)).isoformat(), "yhat": float(last_val)}
            for i in range(1, periods + 1)
        ]

    model = Prophet(
        daily_seasonality=True,
        weekly_seasonality=False,
        yearly_seasonality=False,
        interval_width=0.8,
    )
    model.fit(df)

    future = model.make_future_dataframe(periods=periods, freq="H")
    forecast = model.predict(future)

    forecast_tail = forecast.tail(periods)[["ds", "yhat", "yhat_lower", "yhat_upper"]]
    return forecast_tail.to_dict(orient="records")
