"""
Tamil Nadu crime statistics loaded from the CSV in this folder.

Source file: TN_district_crime_rates_2016_2023.csv
  - Tamil Nadu Police district / city-commissionerate crime rates per lakh
    population. 2016-2022 from the original table, 2023 from "Crime Review
    Tamil Nadu 2023".

Nothing is hardcoded here any more: every number comes from the CSV, so
updating the file (or pointing CRIME_CSV_PATH at another one) updates the app.

What this module provides (Layer A in app/ml/crime_hotspot_model.py):
  * UNITS             - one record per police unit for the reference year
  * UNIT_COORDINATES  - approximate reference point per unit (the CSV has no
                        coordinates, so these are hand-placed centres)
  * assign_unit()     - which unit a lat/lon falls in (or None outside TN)
  * crime_index       - 0..1 per unit from IPC, violent and property crime
                        rates (each scaled between the 5th and 95th percentile
                        so a single outlier does not flatten everyone else,
                        then averaged). SLL cases are ignored: they mostly
                        reflect enforcement drives, not risk to a traveller.

Limits: rates are annual and district-level; unit boundaries are approximated
with reference points and city radii, not official polygons.
"""
import csv
import math
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple

CSV_PATH = Path(os.getenv(
    "CRIME_CSV_PATH",
    Path(__file__).resolve().parent / "TN_district_crime_rates_2016_2023.csv",
))

INDEX_METRICS = ("IPC_Crime_Rate", "Rate_TOTAL_Violent_Crimes", "Rate_TOTAL_Property_Crimes")

# Outside this box, farther than MAX_UNIT_DISTANCE_KM from every unit centre,
# or inside a non-TN enclave -> no crime data (not scored, not guessed).
TN_BBOX = (7.9, 13.7, 76.1, 80.5)  # lat_min, lat_max, lon_min, lon_max
MAX_UNIT_DISTANCE_KM = 65.0
NON_TN_ENCLAVES = {"Puducherry": (11.9416, 79.8083, 14.0), "Karaikal": (10.9254, 79.8380, 8.0)}

# City commissionerates: (lat, lon, radius_km). A point inside the radius is
# assigned to the city, otherwise to the nearest district centre below.
CITY_UNITS = {
    "Chennai": (13.0827, 80.2707, 13.0),
    "Avadi": (13.1067, 80.0970, 6.5),
    "Tambaram": (12.9249, 80.1000, 7.5),
    "Coimbatore City": (11.0168, 76.9558, 9.0),
    "Madurai City": (9.9252, 78.1198, 8.0),
    "Salem City": (11.6643, 78.1460, 6.5),
    "Tiruppur City": (11.1085, 77.3411, 6.5),
    "Trichy City": (10.8050, 78.6856, 8.0),
    "Thirunelveli City": (8.7139, 77.7567, 6.0),
}
# District centres (names match the CSV spelling).
DISTRICT_CENTRES = {
    "Ariyalur": (11.14, 79.08), "Chengalpattu": (12.60, 79.95), "Coimbatore": (10.90, 77.00),
    "Cuddalore": (11.60, 79.60), "Dharmapuri": (12.15, 78.15), "Dindigul": (10.40, 77.90),
    "Erode": (11.35, 77.58), "Kallakurichi": (11.75, 78.95), "Kanchipuram": (12.85, 79.70),
    "Kanyakumari": (8.30, 77.30), "Karur": (10.95, 78.10), "Krishnagiri": (12.55, 78.20),
    "Madurai": (10.00, 78.15), "Mayiladuthurai": (11.10, 79.60), "Nagapattinam": (10.75, 79.80),
    "Namakkal": (11.25, 78.15), "Nilgiris": (11.40, 76.70), "Perambalur": (11.25, 78.85),
    "Pudukottai": (10.30, 78.85), "Ramnathapuram": (9.35, 78.85), "Ranipet": (12.98, 79.50),
    "Salem": (11.60, 78.20), "Sivagangai": (9.85, 78.50), "Tenkasi": (9.00, 77.30),
    "Thanjavur": (10.75, 79.20), "Theni": (10.00, 77.50), "Thirunelveli": (8.55, 77.70),
    "Thiruvallur": (13.25, 80.00), "Thiruvannamalai": (12.30, 79.10), "Thiruvarur": (10.80, 79.55),
    "Thoothukudi": (8.85, 78.10), "Tiruppattur": (12.55, 78.55), "Tiruppur": (10.95, 77.45),
    "Trichy": (10.85, 78.55), "Vellore": (12.93, 79.05), "Villupuram": (11.95, 79.55),
    "Virudhunagar": (9.55, 77.95),
}

UNIT_COORDINATES: Dict[str, Tuple[float, float]] = {
    **{n: (v[0], v[1]) for n, v in CITY_UNITS.items()},
    **DISTRICT_CENTRES,
}

UNITS: Dict[str, dict] = {}
META: dict = {}


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(a))


def _percentile(sorted_vals: List[float], q: float) -> float:
    k = (len(sorted_vals) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def _num(x) -> Optional[float]:
    try:
        return float(x) if x not in (None, "") else None
    except ValueError:
        return None


def load() -> None:
    """Read the CSV and compute the per-unit crime index (idempotent)."""
    if UNITS:
        return
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    known = set(UNIT_COORDINATES)
    needed = INDEX_METRICS + ("Rate_Theft", "Rate_Robbery", "Rate_Burglary")
    complete = [r for r in rows
                if r["District_or_Unit"] in known and all(_num(r[m]) is not None for m in needed)]
    by_year: Dict[int, List[dict]] = {}
    for r in complete:
        by_year.setdefault(int(r["Year"]), []).append(r)
    # Latest year that covers (almost) every unit.
    ref_year = max(y for y, rs in by_year.items() if len(rs) >= 30)
    ref_rows = by_year[ref_year]

    bounds = {}
    for m in INDEX_METRICS:
        vals = sorted(_num(r[m]) for r in ref_rows)
        bounds[m] = (_percentile(vals, 0.05), _percentile(vals, 0.95))

    def scaled(r, m):
        lo, hi = bounds[m]
        return min(1.0, max(0.0, (_num(r[m]) - lo) / (hi - lo))) if hi > lo else 0.0

    for r in ref_rows:
        name = r["District_or_Unit"]
        UNITS[name] = {
            "unit": name,
            "unit_type": r["Unit_Type"],
            "year": ref_year,
            "population_lakh": _num(r["Population_lakh"]),
            "ipc_crime_rate": _num(r["IPC_Crime_Rate"]),
            "violent_crime_rate": _num(r["Rate_TOTAL_Violent_Crimes"]),
            "property_crime_rate": _num(r["Rate_TOTAL_Property_Crimes"]),
            "theft_rate": _num(r["Rate_Theft"]),
            "robbery_rate": _num(r["Rate_Robbery"]),
            "burglary_rate": _num(r["Rate_Burglary"]),
            "crime_index": round(sum(scaled(r, m) for m in INDEX_METRICS) / len(INDEX_METRICS), 3),
        }
    scores = sorted(u["crime_index"] for u in UNITS.values())
    META.update({
        "source_csv": CSV_PATH.name,
        "reference_year": ref_year,
        "units_scored": len(UNITS),
        "index_metrics": list(INDEX_METRICS),
        "median_index": round(_percentile(scores, 0.5), 3),
        "units_without_centre": sorted(
            {r["District_or_Unit"] for r in rows if int(r["Year"]) == ref_year
             and not r["District_or_Unit"].startswith("TAMIL NADU")} - known),
    })


def assign_unit(lat: float, lon: float) -> Optional[str]:
    """Police unit for a coordinate, or None if outside Tamil Nadu coverage."""
    load()
    la0, la1, lo0, lo1 = TN_BBOX
    if not (la0 <= lat <= la1 and lo0 <= lon <= lo1):
        return None
    for clat, clon, radius in NON_TN_ENCLAVES.values():
        if haversine_km(lat, lon, clat, clon) <= radius:
            return None
    best_city, best_ratio = None, 1.0
    for name, (clat, clon, radius) in CITY_UNITS.items():
        if name not in UNITS:
            continue
        ratio = haversine_km(lat, lon, clat, clon) / radius
        if ratio < best_ratio:
            best_city, best_ratio = name, ratio
    if best_city:
        return best_city
    candidates = {n: c for n, c in DISTRICT_CENTRES.items() if n in UNITS}
    nearest = min(candidates, key=lambda n: haversine_km(lat, lon, *candidates[n]))
    if haversine_km(lat, lon, *candidates[nearest]) > MAX_UNIT_DISTANCE_KM:
        return None
    return nearest


def get_unit(name: str) -> Optional[dict]:
    load()
    return UNITS.get(name)


def meta() -> dict:
    load()
    return dict(META)


def all_units() -> List[dict]:
    """All scored units (with their map reference point), highest crime index first."""
    load()
    out = []
    for u in UNITS.values():
        lat, lon = UNIT_COORDINATES[u["unit"]]
        out.append({**u, "lat": lat, "lon": lon})
    return sorted(out, key=lambda u: -u["crime_index"])
