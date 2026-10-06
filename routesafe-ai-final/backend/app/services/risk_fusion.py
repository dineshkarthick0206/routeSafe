"""
Risk Fusion & Scoring Engine — the core novelty of the project.

Combines three independently-sourced risk signals (pollution exposure,
traffic delay, crime hotspot probability) into ONE composite score per
candidate route, using either:
  (a) a user-adjustable weighted sum, or
  (b) Pareto-optimal filtering (routes not dominated on all 3 axes)

Also applies a "mode of travel" multiplier, since a pedestrian's exposure
to both pollution and crime risk is materially higher than a car occupant's.
"""

from dataclasses import dataclass, field
from datetime import datetime

MODE_WEIGHTS = {
    # (aqi_multiplier, crime_multiplier, traffic_multiplier)
    "car":       {"aqi": 0.5, "crime": 0.6, "traffic": 1.0},
    "two_wheeler": {"aqi": 1.0, "crime": 1.0, "traffic": 0.8},
    "walking":   {"aqi": 1.3, "crime": 1.4, "traffic": 0.2},
}


@dataclass
class SegmentRisk:
    lat: float
    lon: float
    eta: datetime
    aqi: float
    crime_score: float
    traffic_delay_factor: float  # 1.0 = no delay, 2.0 = double travel time


@dataclass
class RouteRiskProfile:
    route_index: int
    distance_m: float
    duration_s: float
    avg_aqi: float
    max_crime_score: float
    avg_crime_score: float
    avg_traffic_delay: float
    composite_score: float  # lower = safer/better
    segments: list = field(default_factory=list)


def normalize(value, min_val, max_val):
    """Min-max normalize to 0-1, clamped."""
    if max_val == min_val:
        return 0.0
    return max(0.0, min(1.0, (value - min_val) / (max_val - min_val)))


def score_route(
    route_index: int,
    distance_m: float,
    duration_s: float,
    segment_risks: list[SegmentRisk],
    mode: str = "car",
    weights: dict = None,
) -> RouteRiskProfile:
    """
    Aggregates per-segment risk into one route-level profile.
    weights: {"aqi": 0.33, "crime": 0.34, "traffic": 0.33} - must sum to ~1.0
    """
    if weights is None:
        weights = {"aqi": 0.33, "crime": 0.34, "traffic": 0.33}

    mode_mult = MODE_WEIGHTS.get(mode, MODE_WEIGHTS["car"])

    if not segment_risks:
        avg_aqi, max_crime, avg_crime, avg_delay = 0, 0, 0, 1.0
    else:
        avg_aqi = sum(s.aqi for s in segment_risks) / len(segment_risks)
        max_crime = max(s.crime_score for s in segment_risks)
        avg_crime = sum(s.crime_score for s in segment_risks) / len(segment_risks)
        avg_delay = sum(s.traffic_delay_factor for s in segment_risks) / len(segment_risks)

    # Normalize each dimension to 0-1 using reasonable real-world ranges
    aqi_norm = normalize(avg_aqi, 0, 300) * mode_mult["aqi"]
    crime_norm = normalize(avg_crime, 0, 100) * mode_mult["crime"]
    traffic_norm = normalize(avg_delay, 1.0, 2.5) * mode_mult["traffic"]

    composite = (
        weights["aqi"] * aqi_norm
        + weights["crime"] * crime_norm
        + weights["traffic"] * traffic_norm
    ) * 100  # scale to 0-100 for readability

    return RouteRiskProfile(
        route_index=route_index,
        distance_m=distance_m,
        duration_s=duration_s,
        avg_aqi=round(avg_aqi, 1),
        max_crime_score=round(max_crime, 1),
        avg_crime_score=round(avg_crime, 1),
        avg_traffic_delay=round(avg_delay, 2),
        composite_score=round(composite, 2),
        segments=segment_risks,
    )


def rank_by_weighted_sum(profiles: list[RouteRiskProfile]) -> list[RouteRiskProfile]:
    """Simply sort ascending by composite_score (lower = safer/better)."""
    return sorted(profiles, key=lambda p: p.composite_score)


def pareto_optimal_routes(profiles: list[RouteRiskProfile]) -> list[RouteRiskProfile]:
    """
    Returns only routes that are NOT dominated by any other route on all
    three axes simultaneously (duration, avg_aqi, avg_crime_score).
    A route A dominates B if A is <= B on every axis and < B on at least one.
    """
    def dominates(a: RouteRiskProfile, b: RouteRiskProfile) -> bool:
        axes_a = [a.duration_s, a.avg_aqi, a.avg_crime_score]
        axes_b = [b.duration_s, b.avg_aqi, b.avg_crime_score]
        not_worse_on_all = all(x <= y for x, y in zip(axes_a, axes_b))
        better_on_one = any(x < y for x, y in zip(axes_a, axes_b))
        return not_worse_on_all and better_on_one

    pareto_set = []
    for p in profiles:
        if not any(dominates(other, p) for other in profiles if other is not p):
            pareto_set.append(p)
    return pareto_set


def generate_advisory_text(profile: RouteRiskProfile) -> str:
    """Plain-language explanation of why a route received its score."""
    reasons = []
    if profile.avg_aqi > 150:
        reasons.append(f"high average pollution exposure (AQI ~{profile.avg_aqi})")
    elif profile.avg_aqi > 100:
        reasons.append(f"moderate pollution exposure (AQI ~{profile.avg_aqi})")

    if profile.max_crime_score > 60:
        reasons.append(f"a high-risk crime hotspot segment (score {profile.max_crime_score}/100)")
    elif profile.max_crime_score > 30:
        reasons.append(f"a moderate-risk segment (score {profile.max_crime_score}/100)")

    if profile.avg_traffic_delay > 1.5:
        reasons.append("significant traffic congestion")

    if not reasons:
        return "This route has low pollution, low crime risk, and normal traffic conditions."

    return "This route has " + ", ".join(reasons) + "."
