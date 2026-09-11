"""
Real Tamil Nadu crime statistics — district-level, sourced from Tamil Nadu
Police via the Greater Chennai Police open-data portal (data.opencity.in).

Source dataset: "Tamil Nadu District and Citywise Total Theft and Robbery
Cases Data" — https://data.opencity.in/dataset/tamil-nadu-crime-data
Original source: https://tnpolice.gov.in
Fields: Incidents (I), Victims (V), Crime Rate per lakh population (R)

This is REAL, sourced, district-level annual crime data — not synthetic.
It is aggregate (one row per district per year), not incident-level with
GPS coordinates, which is the genuine limitation of publicly available
Indian crime data compared to something like Chicago's incident-level feed.
See app/ml/crime_hotspot_model.py for how this is used (Layer A), and how
individual incident points shown on the map are statistically anchored to
these real rates but are ultimately synthetic (Layer B).
"""

TN_DISTRICT_CRIME_RATES = {
    "Ariyalur":            {"theft_rate": 9.6,  "robbery_rate": 2.3, "burglary_rate": 6.6},
    "Chennai":             {"theft_rate": 56.1, "robbery_rate": 8.4, "burglary_rate": 9.9},
    "Coimbatore":          {"theft_rate": 8.5,  "robbery_rate": 2.3, "burglary_rate": 7.9},
    "Coimbatore City":     {"theft_rate": 46.2, "robbery_rate": 7.8, "burglary_rate": 14.7},
    "Cuddalore":           {"theft_rate": 9.1,  "robbery_rate": 1.3, "burglary_rate": 5.7},
    "Dharmapuri":          {"theft_rate": 6.9,  "robbery_rate": 0.9, "burglary_rate": 3.4},
    "Dindigul":            {"theft_rate": 11.4, "robbery_rate": 1.7, "burglary_rate": 5.8},
    "Erode":               {"theft_rate": 12.4, "robbery_rate": 1.3, "burglary_rate": 4.4},
    "Kanchipuram":         {"theft_rate": 17.4, "robbery_rate": 6.7, "burglary_rate": 11.4},
    "Kanyakumari":         {"theft_rate": 21.3, "robbery_rate": 2.0, "burglary_rate": 9.3},
    "Karur":               {"theft_rate": 11.3, "robbery_rate": 2.7, "burglary_rate": 6.1},
    "Krishnagiri":         {"theft_rate": 8.5,  "robbery_rate": 1.7, "burglary_rate": 5.5},
    "Madurai":             {"theft_rate": 18.7, "robbery_rate": 6.5, "burglary_rate": 8.9},
    "Madurai City":        {"theft_rate": 41.7, "robbery_rate": 10.6, "burglary_rate": 10.9},
    "Nagapattinam":        {"theft_rate": 8.5,  "robbery_rate": 1.6, "burglary_rate": 4.8},
    "Namakkal":            {"theft_rate": 6.4,  "robbery_rate": 1.4, "burglary_rate": 4.4},
    "Nilgiris":            {"theft_rate": 6.2,  "robbery_rate": 0.5, "burglary_rate": 5.6},
    "Perambalur":          {"theft_rate": 21.5, "robbery_rate": 5.5, "burglary_rate": 13.8},
    "Pudukottai":          {"theft_rate": 16.4, "robbery_rate": 2.3, "burglary_rate": 5.9},
    "Ramanathapuram":      {"theft_rate": 15.9, "robbery_rate": 3.8, "burglary_rate": 11.7},
    "Salem":               {"theft_rate": 5.8,  "robbery_rate": 1.3, "burglary_rate": 3.8},
    "Salem City":          {"theft_rate": 31.8, "robbery_rate": 6.7, "burglary_rate": 6.8},
    "Sivagangai":          {"theft_rate": 13.0, "robbery_rate": 4.0, "burglary_rate": 6.3},
    "Thanjavur":           {"theft_rate": 11.3, "robbery_rate": 4.0, "burglary_rate": 6.9},
    "Theni":               {"theft_rate": 10.3, "robbery_rate": 1.4, "burglary_rate": 6.7},
    "Tirunelveli":         {"theft_rate": 17.8, "robbery_rate": 2.1, "burglary_rate": 12.0},
    "Tirunelveli City":    {"theft_rate": 28.5, "robbery_rate": 4.1, "burglary_rate": 7.6},
    "Thiruvallur":         {"theft_rate": 5.9,  "robbery_rate": 2.2, "burglary_rate": 4.9},
    "Tiruvannamalai":      {"theft_rate": 6.9,  "robbery_rate": 2.1, "burglary_rate": 3.1},
    "Thiruvarur":          {"theft_rate": 6.0,  "robbery_rate": 2.5, "burglary_rate": 5.1},
    "Thoothukudi":         {"theft_rate": 16.9, "robbery_rate": 2.5, "burglary_rate": 9.2},
    "Tiruppur":            {"theft_rate": 11.9, "robbery_rate": 2.7, "burglary_rate": 5.9},
    "Tiruppur City":       {"theft_rate": 30.6, "robbery_rate": 8.4, "burglary_rate": 13.7},
    "Trichy":              {"theft_rate": 17.2, "robbery_rate": 3.0, "burglary_rate": 8.6},
    "Trichy City":         {"theft_rate": 26.2, "robbery_rate": 4.1, "burglary_rate": 6.6},
    "Vellore":             {"theft_rate": 9.5,  "robbery_rate": 2.3, "burglary_rate": 3.7},
    "Villupuram":          {"theft_rate": 11.1, "robbery_rate": 2.6, "burglary_rate": 5.6},
    "Virudhunagar":        {"theft_rate": 9.5,  "robbery_rate": 2.0, "burglary_rate": 4.6},
    "Chengalpattu":        {"theft_rate": 6.4,  "robbery_rate": 2.2, "burglary_rate": 3.2},
    "Kallakurichi":        {"theft_rate": 7.7,  "robbery_rate": 2.1, "burglary_rate": 4.7},
    "Ranipet":             {"theft_rate": 11.7, "robbery_rate": 2.7, "burglary_rate": 3.1},
    "Tirupattur":          {"theft_rate": 10.6, "robbery_rate": 2.0, "burglary_rate": 4.4},
    "Tenkasi":             {"theft_rate": 12.3, "robbery_rate": 0.9, "burglary_rate": 8.7},
}

# District headquarters / centroid coordinates (public knowledge).
TN_DISTRICT_COORDINATES = {
    "Ariyalur":            (11.1401, 79.0782),
    "Chennai":             (13.0827, 80.2707),
    "Coimbatore":          (11.0168, 76.9558),
    "Coimbatore City":     (11.0168, 76.9558),
    "Cuddalore":           (11.7480, 79.7714),
    "Dharmapuri":          (12.1211, 78.1582),
    "Dindigul":            (10.3673, 77.9803),
    "Erode":               (11.3410, 77.7172),
    "Kanchipuram":         (12.8342, 79.7036),
    "Kanyakumari":         (8.0883,  77.5385),
    "Karur":               (10.9601, 78.0766),
    "Krishnagiri":         (12.5266, 78.2150),
    "Madurai":             (9.9252,  78.1198),
    "Madurai City":        (9.9252,  78.1198),
    "Nagapattinam":        (10.7672, 79.8449),
    "Namakkal":            (11.2189, 78.1677),
    "Nilgiris":            (11.4916, 76.7337),
    "Perambalur":          (11.2342, 78.8807),
    "Pudukottai":          (10.3813, 78.8213),
    "Ramanathapuram":      (9.3639,  78.8395),
    "Salem":               (11.6643, 78.1460),
    "Salem City":          (11.6643, 78.1460),
    "Sivagangai":          (9.8433,  78.4809),
    "Thanjavur":           (10.7870, 79.1378),
    "Theni":               (10.0104, 77.4768),
    "Tirunelveli":         (8.7139,  77.7567),
    "Tirunelveli City":    (8.7139,  77.7567),
    "Thiruvallur":         (13.1231, 79.9120),
    "Tiruvannamalai":      (12.2253, 79.0747),
    "Thiruvarur":          (10.7661, 79.6345),
    "Thoothukudi":         (8.7642,  78.1348),
    "Tiruppur":            (11.1085, 77.3411),
    "Tiruppur City":       (11.1085, 77.3411),
    "Trichy":              (10.7905, 78.7047),
    "Trichy City":         (10.7905, 78.7047),
    "Vellore":             (12.9165, 79.1325),
    "Villupuram":          (11.9401, 79.4861),
    "Virudhunagar":        (9.5810,  77.9624),
    "Chengalpattu":        (12.6819, 79.9888),
    "Kallakurichi":        (11.7382, 78.9584),
    "Ranipet":             (12.9249, 79.3308),
    "Tirupattur":          (12.4950, 78.5678),
    "Tenkasi":             (8.9605,  77.3152),
}

# Ranipet and Tirupattur were carved out of the erstwhile Vellore district
# in 2019 — kept as neighbours here since Vellore-focused routing/analysis
# often needs to consider them together.
VELLORE_REGION_DISTRICTS = ["Vellore", "Ranipet", "Tirupattur"]


def get_composite_crime_rate(district: str) -> float:
    """Theft + 2x Robbery (confrontational, weighted higher) + Burglary."""
    rates = TN_DISTRICT_CRIME_RATES.get(district)
    if not rates:
        return 0.0
    return round(rates["theft_rate"] * 1.0 + rates["robbery_rate"] * 2.0 + rates["burglary_rate"] * 1.0, 2)


MAX_COMPOSITE_RATE = max(get_composite_crime_rate(d) for d in TN_DISTRICT_CRIME_RATES)
