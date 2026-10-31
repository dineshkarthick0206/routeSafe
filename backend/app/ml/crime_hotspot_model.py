"""
Crime Hotspot Model - Tamil Nadu edition.

DATA NOTE (read this before your demo/viva):
No free, public, live, incident-level ("lat/lon per crime") crime API exists
for Tamil Nadu, or for India generally. What exists is district-level annual
crime-rate data from Tamil Nadu Police, supplied here as
app/data/TN_district_crime_rates_2016_2023.csv (see app/data/tn_crime_data.py).

Two layers, always kept distinguishable in the API response:

  LAYER A - District-level risk score (100% CSV data)
      crime_index (0..1) per police unit from IPC, violent and property crime
      rates per lakh population. Points outside Tamil Nadu get no score.

  LAYER B - Statistically-anchored synthetic hotspots
      Individual incident points (crime type, severity, date/time - used for
      the heatmap, cluster markers and hotspot polygons, and for the
      time-of-day part of route scoring) are synthetic, but each unit's point
      DENSITY and theft/robbery/burglary MIX are anchored to that unit's CSV
      rates. This is a rate-anchored simulation, not incident records, and
      the API says so via `data_honesty_note`.
"""

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN
from scipy.spatial import ConvexHull, QhullError
from datetime import datetime, timedelta

from app.config import settings
from app.data import tn_crime_data as crime_data
from app.data.tn_crime_data import haversine_km  # re-exported for callers

CRIME_TYPES = ["Theft", "Robbery", "Burglary"]

# Base severity per crime type (before time-of-day adjustment)
BASE_SEVERITY = {"Theft": "Low", "Burglary": "Medium", "Robbery": "High"}
SEVERITY_RANK = {"Low": 0, "Medium": 1, "High": 2}
SEVERITY_WEIGHT = {"Low": 0.35, "Medium": 0.6, "High": 1.0}  # for heatmap intensity


# ---------------------------------------------------------------------
# LAYER A — Real district-level risk scoring
# ---------------------------------------------------------------------

def get_nearest_district(lat: float, lon: float):
    """Police unit containing this point, or None outside Tamil Nadu coverage."""
    return crime_data.assign_unit(lat, lon)


def get_district_risk_score(lat: float, lon: float) -> dict:
    """CSV-based district risk for a point. risk_score is 0-100, or None if no data."""
    unit_name = crime_data.assign_unit(lat, lon)
    unit = crime_data.get_unit(unit_name) if unit_name else None
    if not unit:
        return {"district": None, "risk_score": None, "crime_index": None,
                "layer": "no_data_outside_tn"}
    return {
        "district": unit_name,
        "risk_score": round(unit["crime_index"] * 100, 1),
        "crime_index": unit["crime_index"],
        "year": unit["year"],
        "ipc_crime_rate": unit["ipc_crime_rate"],
        "layer": "csv_district_data",
    }


# ---------------------------------------------------------------------
# LAYER B — Real-rate-anchored synthetic incidents
# ---------------------------------------------------------------------

def _crime_type_weights(district: str):
    """Type mix proportional to that district's REAL per-category rates."""
    rates = crime_data.get_unit(district) or {}
    weights = np.array([
        rates.get("theft_rate") or 1.0,
        rates.get("robbery_rate") or 1.0,
        rates.get("burglary_rate") or 1.0,
    ], dtype=float)
    weights = np.clip(weights, 0.1, None)
    return weights / weights.sum()


def _severity_for(crime_type: str, hour: int, rng) -> str:
    base = BASE_SEVERITY[crime_type]
    # Night hours (9pm-4am) bump severity up one notch with some probability
    if (hour >= 21 or hour <= 4) and rng.random() < 0.3:
        order = ["Low", "Medium", "High"]
        idx = min(order.index(base) + 1, 2)
        return order[idx]
    return base


def _night_weighted_hour_probabilities():
    weights = np.array([
        3, 2, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        2, 2, 3, 4, 5, 5, 4, 3
    ], dtype=float)
    return weights / weights.sum()


def generate_rate_anchored_synthetic_points(points_per_max_rate=250, days_back=365, seed=42) -> pd.DataFrame:
    """
    Generates synthetic incident points unit-by-unit, density proportional to
    each unit's CSV crime_index, crime-type mix proportional to that unit's
    CSV theft/robbery/burglary rates,
    and a date spread across the past `days_back` days (default: 1 year,
    to power the time slider) with a night-weighted hour distribution.
    """
    rng = np.random.default_rng(seed)
    rows = []
    now = datetime.utcnow()
    incident_id = 0

    crime_data.load()
    for district, (d_lat, d_lon) in crime_data.UNIT_COORDINATES.items():
        unit = crime_data.get_unit(district)
        if not unit:
            continue  # unit has no complete CSV row for the reference year
        n_points = max(3, int(unit["crime_index"] * points_per_max_rate))

        n_subclusters = rng.integers(2, 4)
        subcluster_centers = [
            (d_lat + rng.uniform(-0.03, 0.03), d_lon + rng.uniform(-0.03, 0.03))
            for _ in range(n_subclusters)
        ]

        type_weights = _crime_type_weights(district)
        hour_probs = _night_weighted_hour_probabilities()

        for _ in range(n_points):
            sc_lat, sc_lon = subcluster_centers[rng.integers(0, n_subclusters)]
            lat = sc_lat + rng.normal(0, 0.006)
            lon = sc_lon + rng.normal(0, 0.006)
            hour = int(rng.choice(range(24), p=hour_probs))
            days_ago = int(rng.integers(0, days_back))
            occurred_at = now - timedelta(days=days_ago)
            crime_type = str(rng.choice(CRIME_TYPES, p=type_weights))
            severity = _severity_for(crime_type, hour, rng)

            incident_id += 1
            rows.append({
                "id": f"inc_{incident_id}",
                "district": district,
                "latitude": lat,
                "longitude": lon,
                "hour": hour,
                "day_of_week": occurred_at.weekday(),
                "month": occurred_at.month,
                "date": occurred_at.strftime("%Y-%m-%d"),
                "crime_type": crime_type,
                "severity": severity,
                "source": "rate_anchored_synthetic",
            })

    return pd.DataFrame(rows)


def run_st_dbscan(df: pd.DataFrame, eps_km=0.4, eps_time_hours=3, min_samples=5):
    """Spatio-temporal DBSCAN: time scaled into the same km-space as lat/lon."""
    if df.empty:
        return df.assign(cluster=-1)

    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * np.cos(np.radians(df["latitude"].mean()))

    x_km = df["longitude"] * km_per_deg_lon
    y_km = df["latitude"] * km_per_deg_lat

    time_scale_km_per_hour = eps_km / eps_time_hours
    t_scaled = df["hour"] * time_scale_km_per_hour

    features = np.column_stack([x_km, y_km, t_scaled])
    db = DBSCAN(eps=eps_km, min_samples=min_samples).fit(features)

    df = df.copy()
    df["cluster"] = db.labels_
    return df


def build_hotspot_grid(df: pd.DataFrame, grid_size_deg=0.005):
    """Aggregates clustered points into a grid-cell risk table (used for route scoring)."""
    if df.empty:
        return pd.DataFrame(columns=["grid_lat", "grid_lon", "hour_bucket", "incident_count", "risk_score"])

    df = df.copy()
    df["grid_lat"] = (df["latitude"] / grid_size_deg).round() * grid_size_deg
    df["grid_lon"] = (df["longitude"] / grid_size_deg).round() * grid_size_deg
    df["hour_bucket"] = (df["hour"] // 3) * 3

    grouped = (
        df[df["cluster"] != -1]
        .groupby(["grid_lat", "grid_lon", "hour_bucket"])
        .size()
        .reset_index(name="incident_count")
    )

    if grouped.empty:
        return grouped.assign(risk_score=[])

    max_count = grouped["incident_count"].max()
    grouped["risk_score"] = (grouped["incident_count"] / max_count * 100).round(1)
    return grouped


def get_street_level_risk(hotspot_grid: pd.DataFrame, lat: float, lon: float, hour: int,
                           grid_size_deg=0.005, search_radius_cells=1) -> float:
    if hotspot_grid.empty:
        return 0.0
    grid_lat = round(lat / grid_size_deg) * grid_size_deg
    grid_lon = round(lon / grid_size_deg) * grid_size_deg
    hour_bucket = (hour // 3) * 3
    match = hotspot_grid[
        (abs(hotspot_grid["grid_lat"] - grid_lat) <= grid_size_deg * search_radius_cells)
        & (abs(hotspot_grid["grid_lon"] - grid_lon) <= grid_size_deg * search_radius_cells)
        & (hotspot_grid["hour_bucket"] == hour_bucket)
    ]
    if match.empty:
        return 0.0
    return float(match["risk_score"].max())


def get_risk_for_point(hotspot_grid: pd.DataFrame, lat: float, lon: float, hour: int,
                        district_weight: float = None, street_weight: float = None) -> dict:
    """
    Blended 0-100 crime risk for a point. risk_score is None outside Tamil Nadu
    (no data - the caller must not treat that as "safe").
    """
    if street_weight is None:
        street_weight = settings.STREET_LAYER_WEIGHT
    if district_weight is None:
        district_weight = 1.0 - street_weight

    layer_a = get_district_risk_score(lat, lon)
    if layer_a["risk_score"] is None:
        return {"risk_score": None, "district": None, "district_real_score": None,
                "street_level_synthetic_score": None, "crime_index": None}

    layer_b_score = get_street_level_risk(hotspot_grid, lat, lon, hour)
    blended = round(district_weight * layer_a["risk_score"] + street_weight * layer_b_score, 1)
    return {
        "risk_score": blended,
        "district": layer_a["district"],
        "district_real_score": layer_a["risk_score"],
        "street_level_synthetic_score": layer_b_score,
        "crime_index": layer_a["crime_index"],
        "year": layer_a["year"],
        "ipc_crime_rate": layer_a["ipc_crime_rate"],
    }


# ---------------------------------------------------------------------
# Map-facing helpers: filtering + hotspot boundary polygons
# ---------------------------------------------------------------------

def filter_incidents(df: pd.DataFrame, month=None, hour_min=None, hour_max=None) -> pd.DataFrame:
    """
    month: 1-12 or None for all.
    hour_min/hour_max: inclusive hour range (0-23). If hour_min > hour_max,
    treated as a wrap-around range (e.g. 21..4 covers night across midnight).
    """
    out = df
    if month:
        out = out[out["month"] == month]
    if hour_min is not None and hour_max is not None:
        if hour_min <= hour_max:
            out = out[(out["hour"] >= hour_min) & (out["hour"] <= hour_max)]
        else:
            out = out[(out["hour"] >= hour_min) | (out["hour"] <= hour_max)]
    return out


def compute_hotspot_boundaries(filtered_df: pd.DataFrame) -> list:
    """
    For each non-noise DBSCAN cluster (labels already computed on the full
    dataset), draws a convex-hull boundary polygon using only the points
    that survive the current time filter (`filtered_df`, which retains the
    original 'cluster' column). Clusters with fewer than 3 surviving points
    are skipped (no hull possible).
    """
    hotspots = []
    if filtered_df.empty or "cluster" not in filtered_df.columns:
        return hotspots

    for cluster_id, group in filtered_df[filtered_df["cluster"] != -1].groupby("cluster"):
        if len(group) < 3:
            continue
        points = group[["latitude", "longitude"]].to_numpy()
        try:
            hull = ConvexHull(points)
        except QhullError:
            continue
        polygon = points[hull.vertices].tolist()  # [[lat, lon], ...]

        severity_counts = group["severity"].value_counts()
        dominant_severity = severity_counts.idxmax() if not severity_counts.empty else "Low"
        risk_level = {"Low": "moderate", "Medium": "high", "High": "very_high"}.get(dominant_severity, "moderate")

        hotspots.append({
            "cluster_id": int(cluster_id),
            "district": group["district"].mode().iat[0],
            "point_count": int(len(group)),
            "risk_level": risk_level,
            "dominant_crime_type": group["crime_type"].mode().iat[0],
            "polygon": polygon,
        })

    hotspots.sort(key=lambda h: h["point_count"], reverse=True)
    return hotspots
