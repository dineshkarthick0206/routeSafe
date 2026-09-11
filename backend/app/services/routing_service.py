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
ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/driving-car"


async def get_routes_osrm(start_lat, start_lon, end_lat, end_lon, waypoints=None, alternatives=True):
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

    url = f"{OSRM_BASE_URL}/{coords}"
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


async def get_routes(start_lat, start_lon, end_lat, end_lon, waypoints=None):
    """
    Main entry point. Tries OSRM first (free, unlimited-ish); if it fails,
    could fall back to ORS (not implemented here to keep the demo simple,
    but the function signature is ready for it).
    """
    routes = await get_routes_osrm(start_lat, start_lon, end_lat, end_lon, waypoints=waypoints)
    # Limit to configured number of alternatives
    return routes[: settings.NUM_ROUTE_ALTERNATIVES]


def sample_route_points(geometry: list[tuple[float, float]], every_n: int = 5):
    """
    Downsample a route's polyline so we don't query AQI/crime/traffic for
    every single GPS point (which could be hundreds). We sample every Nth
    point plus always include the first and last.
    """
    if len(geometry) <= every_n:
        return geometry
    sampled = geometry[::every_n]
    if geometry[-1] not in sampled:
        sampled.append(geometry[-1])
    return sampled
