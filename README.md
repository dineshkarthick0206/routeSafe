# RouteSafe AI — Setup & Deployment Guide

A multi-modal safe-route recommender for Tamil Nadu that fuses live air
quality (OpenAQ), routing (OSRM), and crime hotspot risk (real Tamil Nadu
Police district data + ST-DBSCAN spatio-temporal clustering) into a
single safety-ranked route list — shown on an interactive dark-mode map
with a live crime heatmap, hotspot boundaries, waypoints, live GPS
tracking, and a time slider.

---

## 0. What's new in this version

1. **Pin locations on the map** instead of typing coordinates — click
   "Pin on map" next to Start/Destination, then click anywhere on the
   map. Manual lat/lon entry is still available as a fallback (see
   "Enter coordinates manually" under each field).
2. **Dark dashboard UI** with an interactive crime heatmap (green → yellow
   → orange → red by density), cluster markers that expand into
   individual incidents on zoom, hotspot boundary polygons, and a
   **spatio-temporal time slider** (scrub by month + time-of-day band) —
   moving it live-updates the heatmap and hotspots.
3. **Live location**: "Use my location" (one-shot) and a "Live tracking"
   toggle that follows your position on the map and shows a
   "Recalculate from here" banner if you drift off the recommended route.
4. **Map layer switcher**: Dark / Streets / Satellite / Terrain, via the
   layers control in the top-right of the map.
5. **Waypoints (stops)**: click "+ Add stop", then click the map to drop
   a stop between your start and destination. Reorder with ↑/↓ or remove
   with the Remove button — all draggable directly on the map too.

---

## 1. Project Structure

```
routesafe-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI entry point
│   │   ├── config.py                   # env/config loader
│   │   ├── crime_cache.py              # shared in-memory crime dataset cache
│   │   ├── data/
│   │   │   └── tn_crime_data.py        # REAL Tamil Nadu Police district crime rates
│   │   ├── routers/
│   │   │   ├── route_router.py         # POST /api/routes/safe-route (supports waypoints)
│   │   │   └── crime_router.py         # GET /api/crime/heatmap, /api/crime/meta
│   │   ├── services/
│   │   │   ├── aqi_service.py          # OpenAQ integration
│   │   │   ├── weather_service.py      # OpenWeatherMap integration
│   │   │   ├── routing_service.py      # OSRM integration (multi-waypoint)
│   │   │   └── risk_fusion.py          # scoring/ranking engine
│   │   └── ml/
│   │       ├── crime_hotspot_model.py  # real+synthetic crime layers, ST-DBSCAN, hotspot polygons
│   │       └── aqi_forecast_model.py   # Prophet short-horizon forecast
│   ├── requirements.txt
│   ├── .env.example
│   └── render.yaml
└── frontend/
    ├── src/
    │   ├── App.jsx                     # main layout + state orchestration
    │   ├── api.js                      # backend API client
    │   ├── index.css                   # dark glassmorphism theme
    │   ├── hooks/useLiveLocation.js     # geolocation (one-shot + live tracking)
    │   ├── utils/geo.js                 # haversine + off-route drift detection
    │   └── components/
    │       ├── SearchPanel.jsx          # pin-on-map, waypoints, live location, ranking
    │       ├── RouteMap.jsx             # map: layers, pins, drag, routes, live location
    │       ├── HeatmapLayer.jsx         # leaflet.heat crime density layer
    │       ├── IncidentClusterLayer.jsx # leaflet.markercluster incident markers
    │       ├── HotspotPolygons.jsx      # convex-hull hotspot boundary zones
    │       ├── TimeSlider.jsx           # month + time-of-day filter
    │       ├── MapLegend.jsx            # heat gradient legend + layer toggles
    │       ├── KpiBar.jsx               # top summary KPI cards
    │       └── RouteCards.jsx           # per-route risk breakdown cards
    ├── package.json
    ├── vite.config.js
    └── vercel.json
```

---

## 2. Get your free API keys (do this first)

| Service | Used for | Sign up | Free tier |
|---|---|---|---|
| OpenWeatherMap | Weather | https://home.openweathermap.org/users/sign_up | 1,000 calls/day |
| OpenAQ | Live air quality | https://explore.openaq.org/ → Account → API Keys | Generous, key required for v3 |
| OpenRouteService | (optional, alt-route fallback) | https://openrouteservice.org/dev/#/signup | 2,000 req/day |

OSRM's public routing server (`router.project-osrm.org`) needs **no key** —
it's used directly for the main routing engine, including multi-waypoint
routes.

The crime module needs **no API key at all** — see the data note below.

---

## 3. Crime data: Tamil Nadu (real, two-layer approach)

No free, live, incident-level ("one row per crime with GPS coordinates")
crime API exists for Tamil Nadu or India generally — this is a genuine
data-availability gap, not a shortcut. What this project uses instead:

- **Layer A — District-Level Risk Score (100% real data).** Real,
  published Tamil Nadu Police theft/robbery/burglary rates per district
  (sourced via the Greater Chennai Police open-data portal,
  `data.opencity.in`), hand-entered into `backend/app/data/tn_crime_data.py`.
  Every route segment's crime score is grounded in this real number for
  whichever district it passes through.
- **Layer B — Rate-Anchored Synthetic Hotspots.** Since no public source
  publishes individual incident locations, the heatmap, cluster markers,
  and hotspot boundary polygons on the map use synthetic points —
  but their **density and crime-type mix per district are proportional
  to that district's real rate** (Layer A), not uniform random noise.
  Every incident returned by `/api/crime/heatmap` is clearly labeled
  `"source": "rate_anchored_synthetic"`, and the endpoint includes a
  `data_honesty_note` field for transparency in any UI built on top of it.

The final route risk score blends both layers (60% real district data,
40% synthetic street-level detail by default — see `get_risk_for_point`
in `crime_hotspot_model.py`), so every recommendation is always grounded
in genuine Tamil Nadu Police statistics even where finer detail is
simulated.

> If you later obtain real incident-level data (e.g. via an RTI request),
> swap `generate_rate_anchored_synthetic_points()` for a real data loader
> that returns a DataFrame with the same columns
> (`latitude, longitude, hour, month, date, crime_type, severity, district`)
> — the rest of the pipeline (ST-DBSCAN, hotspot polygons, heatmap API)
> is dataset-agnostic and needs no other changes.

---

## 4. Backend setup (local)

```bash
cd routesafe-ai/backend

# 1. Create a virtual environment (Python 3.12 recommended — see note below)
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment variables
cp .env.example .env
# Open .env and paste your real API keys (OpenWeatherMap, OpenAQ)

# 4. Run the server
uvicorn app.main:app --reload --port 8000
```

> **Python version note:** use Python 3.11 or 3.12. Very new Python
> versions (3.13+) often lack prebuilt wheels for numpy/pandas/scikit-learn,
> forcing a slow source compile that needs a C++ build toolchain. 3.12 has
> full prebuilt wheel support for every package this project uses.

Visit **http://localhost:8000/docs** for the interactive Swagger UI. Try
the two main endpoint groups directly there:

**`POST /api/routes/safe-route`** — now supports an optional `waypoints`
array:
```json
{
  "start_lat": 13.0604, "start_lon": 80.2496,
  "end_lat": 13.0067, "end_lon": 80.2206,
  "waypoints": [{"lat": 13.035, "lon": 80.235}],
  "mode": "car",
  "weight_aqi": 0.33, "weight_crime": 0.34, "weight_traffic": 0.33,
  "ranking": "weighted"
}
```

**`GET /api/crime/heatmap?month=3&hour_min=18&hour_max=23`** — powers the
map's heatmap/cluster/hotspot layers and the time slider. Omit `month` /
`hour_min` + `hour_max` for all-time data.

**Note on first request latency:** the first call to either endpoint
family is slower (a few seconds) because it builds and clusters the
crime dataset once. It's cached in memory after that (`app/crime_cache.py`).
For production, replace this with a scheduled job (APScheduler/cron) that
rebuilds every few hours — `get_crime_cache()` is the single place to change.

---

## 5. Frontend setup (local)

Open a **second terminal** (keep the backend running in the first):

```bash
cd routesafe-ai/frontend

# 1. Install dependencies (requires Node.js 18+)
npm install

# 2. Run the dev server
npm run dev
```

Visit **http://localhost:5173**. The Vite dev server proxies `/api` calls
to your backend on port 8000 automatically (see `vite.config.js`).

---

## 6. How to use the app

1. **Set your start and destination** — click "📍 Pin on map" next to
   either field, then click anywhere on the map, or use "🎯 Use my
   location" to start from your current GPS position. Both markers are
   draggable directly on the map too.
2. **Add stops (optional)** — click "+ Add stop", then click the map.
   Reorder with the ↑/↓ buttons or remove with "Remove".
3. **Choose your mode of travel** — reweights how much pollution/crime
   risk matters (a pedestrian is affected far more than a car occupant).
4. **Choose a ranking method** — Weighted sum (use the sliders to state
   your own priorities) or Pareto-optimal (only routes where no other
   option is simultaneously faster, cleaner, *and* safer).
5. **Click Find Safe Route.** The map shows up to 3 candidate routes
   (green = top recommendation), the top bar shows live KPIs, and the
   sidebar shows a full risk breakdown and plain-language advisory per
   route.
6. **Explore the crime layers** — toggle Heatmap / Incident markers /
   Hotspot boundaries from the legend panel (top-right of the map), and
   scrub the **time slider** (bottom of the map) by month and time-of-day
   band to see how hotspots shift.
7. **Switch map style** — use the layers icon (top-right of the map) for
   Dark / Streets / Satellite / Terrain.
8. **Live tracking** — check "Live tracking" in the sidebar to follow
   your real position on the map. If you drift off the recommended
   route, a banner appears with a one-click "Recalculate from here."

---

## 7. Deploying online

### Backend → Render (free tier)

1. Push the `backend/` folder to a GitHub repo.
2. Go to https://dashboard.render.com → New → Web Service → connect your repo.
3. Render detects `render.yaml` automatically. If not, set manually:
   - Build command: `pip install -r requirements.txt`
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Under **Environment**, add your API keys (same names as `.env.example`).
5. Deploy. Note the live URL, e.g. `https://routesafe-ai-backend.onrender.com`.

> Free-tier Render services spin down after inactivity — the first
> request after idling can take ~30-50 seconds to wake up. This is normal.

### Frontend → Vercel (free tier)

1. Push the `frontend/` folder to a GitHub repo.
2. Go to https://vercel.com/new → import your repo → set **Root Directory** to `frontend`.
3. Add an environment variable: `VITE_API_BASE_URL` = your Render backend URL.
4. Deploy. Vercel gives you a live `https://your-project.vercel.app` URL.

### Update CORS

Once deployed, open `backend/app/config.py` and replace the wildcard
`"*"` in `ALLOWED_ORIGINS` with your actual Vercel URL, then redeploy.

---

## 8. Known limitations to mention in your report/viva

- **Crime data is real at the district level, but not incident-level or
  live** — see section 3 above. This is a genuine, disclosed limitation
  of publicly available Indian crime data, not a shortcut unique to this
  project. An RTI request for real incident-level data is a natural next
  step (see the RTI application drafted alongside this project).
- **District assignment uses nearest-centroid, not real polygon
  boundaries** — a point near a district border could be assigned to the
  wrong district. Swapping in official district shapefiles (Survey of
  India / data.gov.in) for point-in-polygon lookup would fix this.
- **"Recalculate from here" is manual, not fully automatic turn-by-turn
  rerouting** — live tracking detects drift and shows a one-click banner
  rather than silently re-routing every few seconds, to avoid hammering
  the routing API. This is a deliberate, disclosed scope decision.
- **Traffic delay is currently a simplification**
  (`traffic_delay_factor = 1.0` placeholder in `route_router.py`) — a
  dedicated per-segment traffic API (e.g. TomTom) would make this fully
  rigorous.
- **OSRM's public demo server** is rate-limited — fine for a course
  project/demo; a real deployment would self-host OSRM with local map
  data (`.osm.pbf` + Docker). It also does not reliably support
  alternative routes when waypoints are used, so alternatives are
  automatically disabled whenever a request includes stops.

---

## 9. Quick command summary

```bash
# Terminal 1 — backend
cd routesafe-ai/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd routesafe-ai/frontend
npm run dev
```
