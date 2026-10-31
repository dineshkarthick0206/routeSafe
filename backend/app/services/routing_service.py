"""
Routing Service — generates candidate routes between two points.

Primary: OSRM public demo server (https://router.project-osrm.org) - free, no API key,
         but rate-limited and not for heavy production use. Good for coursework/demo.
Alternative-routes: OpenRouteService (https://openrouteservice.org) - free tier,
         requires a free API key, supports 'alternative_routes' natively.

For a real production deployment you would self-host OSRM with local .osm.pbf data
(see the Dockerfile note in routing_service_selfhost.md), but the public server is
sufficient for a working demo.
"""

import polyline
from app.config import settings
from app.http_client import get_client

OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving"
# Public pedestrian routing (OSM-based, same OSRM API; the path says "driving"
# on that server but the profile behind it is foot).
FOOT_BASE_URL = "https://routing.openstreetmap.de/routed-foot/route/v1/driving"

# The OSRM demo server only has a car profile, so travel time for the other
# modes is estimated from distance:
WALK_SPEED_KMH = 5.0
TWO_WHEELER_MAX_KMH = 45.0  # average ceiling for a motorbike / scooter
ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car"


async def get_routes_osrm(start_lat, start_lon, end_lat, end_lon, waypoints=None, alternatives=True,
                          base_url=OSRM_BASE_URL):
    """
    OSRM expects coordinates as lon,lat (note the order!).
    `waypoints`, if given, is a list of (lat, lon) via-points visited in
    order between start and end. OSRM's public server does not reliably
    support alternative routes once more than 2 waypoints are given, so
    alternatives are automatically disabled whenever waypoints are present.
    Returns a list of route dicts: {geometry: [(lat,lon),...], distance_m, duration_s}
    """
    waypoints = waypoints or []
    all_points = [(start_lat, start_lon)] + list(waypoints) + [(end_lat, end_lon)]
    coords = ";".join(f"{lon},{lat}" for lat, lon in all_points)
    use_alternatives = alternatives and not waypoints

    url = f"{base_url}/{coords}"
    params = {
        "overview": "full",
        "geometries": "polyline",
        "alternatives": "true" if use_alternatives else "false",
        "steps": "false",
    }
    client = get_client()
    resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != "Ok":
        raise ValueError(f"OSRM routing failed: {data.get('message', 'unknown error')}")

    routes = []
    for route in data["routes"]:
        decoded = polyline.decode(route["geometry"])  # list of (lat, lon)
        routes.append({
            "geometry": decoded,
            "distance_m": route["distance"],
            "duration_s": route["duration"],
        })
    return routes


def apply_mode_duration(routes, mode):
    """
    Replace the car duration with a mode-appropriate estimate.
      walking     -> distance / 5 km/h
      two_wheeler -> distance / min(car average speed, 45 km/h)
      car         -> unchanged (OSRM's own duration)
    """
    for r in routes:
        km = r["distance_m"] / 1000.0
        if mode == "walking":
            r["duration_s"] = km / WALK_SPEED_KMH * 3600.0
        elif mode == "two_wheeler" and r["duration_s"] > 0:
            car_kmh = km / (r["duration_s"] / 3600.0)
            r["duration_s"] = km / min(car_kmh, TWO_WHEELER_MAX_KMH) * 3600.0
    return routes


async def get_routes(start_lat, start_lon, end_lat, end_lon, waypoints=None, mode="car"):
    """
    Main entry point.
    - walking: tries the public pedestrian router first (real footpaths); if it
      is unreachable, falls back to the road route and says so via
      route["profile"] == "driving_estimate".
    - car / two_wheeler: OSRM road routes. Durations are then adjusted per mode.
    """
    routes = None
    if mode == "walking":
        try:
            routes = await get_routes_osrm(start_lat, start_lon, end_lat, end_lon,
                                           waypoints=waypoints, base_url=FOOT_BASE_URL)
            for r in routes:
                r["profile"] = "foot"
        except Exception:
            routes = None
    if routes is None:
        routes = await get_routes_osrm(start_lat, start_lon, end_lat, end_lon, waypoints=waypoints)
        for r in routes:
            r["profile"] = "driving_estimate" if mode != "car" else "driving"
    routes = routes[: settings.NUM_ROUTE_ALTERNATIVES]
    return apply_mode_duration(routes, mode)


MAX_SAMPLE_POINTS = 15  # hard ceiling regardless of route length


def sample_route_points(geometry: list[tuple[float, float]], every_n: int = 8,
                        max_points: int = MAX_SAMPLE_POINTS):
    """
    Downsample a route polyline. Takes every Nth point, then, if that still
    exceeds `max_points` (long routes like Coimbatore -> Salem have thousands
    of polyline points), picks evenly spaced points so the count never
    exceeds the cap. First and last points are always included.
    """
    if len(geometry) <= 2:
        return list(geometry)
    sampled = list(geometry[::every_n])
    if sampled[-1] != geometry[-1]:
        sampled.append(geometry[-1])
    if len(sampled) > max_points:
        step = (len(sampled) - 1) / (max_points - 1)
        sampled = [sampled[round(k * step)] for k in range(max_points)]
    return sampled
