# RouteSafe AI

Safer-route planner for Tamil Nadu: FastAPI backend + React/Vite frontend.
Candidate routes are scored on air quality, crime context and traffic, then ranked
by a weighted score or a Pareto trade-off.

This version combines:
- **UI** - the look and layout of the "real crime data" project, rebuilt with the combined project's map features (`frontend/`)
- **Logic** - the backend from the "final combined" project (`backend/`): OSRM routing with
  waypoints and long-route sampling, OpenAQ AQI with caching, risk fusion, ST-DBSCAN hotspot model,
  place search with Nominatim -> Photon fallback, shared HTTP client, CORS for deployment
- **Data** - `backend/app/data/TN_district_crime_rates_2016_2023.csv` drives all crime scoring

## Features
- **Crime heatmap** with hotspot boundaries and clustered incident markers, filterable by month and time of day
  (these points are a rate-anchored simulation, see below), plus a **District crime index** layer drawn from the real CSV
- **Map layers**: Streets, Dark, Light, Satellite, Terrain (switcher at the top right of the map)
- **Live location**: "My location" for the start point, live tracking that follows you, off-route detection and
  "Recalculate from here"
- **Voice search**: tap the mic in the Start or Destination box and say a place name
- **Voice guidance**: spoken route summary, progress updates with distance left, off-route warning and arrival
  (turns on live tracking for you)
- **Travel modes with their own times**: car (routing engine), two-wheeler (estimated, up to 45 km/h average) and
  walking (pedestrian routing when available, about 5 km/h)
- Intermediate stops, swap start/destination, drag pins, weighted or Pareto ranking, tap a card or a route line to select it
- Layout adapts to screen width **and** height (desktop, laptop, tablet, phone, landscape)

Voice and location need Chrome or Edge and a secure origin: `http://localhost` or an `https://` site (the deployed Vercel
URL is fine). Opening the dev server by a LAN IP over plain http will block the microphone and location.

## Run locally

Backend (Python 3.10+):
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add your OpenAQ / OpenWeather / ORS keys (optional)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
Check `http://127.0.0.1:8000/health` and `/docs`.

Frontend (Node 18+), in a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. In development Vite proxies `/api` and `/health` to the backend on port 8000, so no
settings are needed. For production set `VITE_API_BASE_URL` to the deployed backend URL (see `frontend/.env.example`).

## Deploy
- Backend on Render: `backend/render.yaml` (free tier; keep `WEB_CONCURRENCY=1`).
- Frontend on Vercel: set `VITE_API_BASE_URL` to the Render URL; `frontend/vercel.json` is included.

## How crime is scored (all from the CSV)
1. **District layer** (`app/data/tn_crime_data.py`): for the latest year with full coverage (2023), each police unit
   (district / city commissionerate) gets a 0-1 `crime_index` from its IPC, violent and property crime rates per lakh
   population, each scaled between the 5th and 95th percentile and averaged. SLL cases are ignored.
2. **Unit assignment**: each sampled route point is assigned to a city commissionerate (inside its radius) or the
   nearest district centre. Points outside Tamil Nadu get **no** crime data; they are left out of the average and
   reported as `crime_coverage` (if a route has no coverage at all, the state median is used and the advisory says so).
3. **Street-level layer** (`app/ml/crime_hotspot_model.py`): synthetic incident points whose density and
   theft/robbery/burglary mix are anchored to each unit's CSV rates, clustered with ST-DBSCAN, used for the
   time-of-day part of scoring and for the `/api/crime/heatmap` endpoint. **These are not real incident records.**
   Its share of the per-point score is `STREET_LAYER_WEIGHT` (default `0.4`). Set it to `0` to score crime from the
   CSV district rates alone.

To use different data, replace the CSV (same columns) or set `CRIME_CSV_PATH`.

## API notes
- `POST /api/routes/safe-route` - routes include `avg_crime_score` / `max_crime_score` (0-1), `crime_breakdown`
  (units crossed, in order), `crime_coverage`, `crime_data_source`, `risk_data_status`.
- `GET /api/crime/meta`, `/api/crime/units`, `/api/crime/point?lat=..&lon=..` - inspect the CSV-backed scores.
- `GET /api/crime/heatmap` - simulated incident points and hotspot polygons for the map layers.
- `GET /api/places/search?q=...` - place search.

## Limitations
- CSV rates are annual and district-level: no street-level or time-of-day information. Unit boundaries are
  approximated with reference points and city radii, not official polygons, so places near a border can fall in the
  neighbouring unit.
- Some 2023 columns (e.g. POCSO rape, grievous hurt) are blank in the source; the index uses only the three
  complete metrics. Railway Police rows have no rates and are not scored.
- Walking and two-wheeler times are estimates from distance (the public car router has no such profiles); walking
  uses a public pedestrian router when reachable and falls back to the road route otherwise.
- AQI is live from OpenAQ only where a station is nearby; otherwise a neutral default (60) is used. Traffic is not
  live (delay factor fixed at 1.0).
- This is a decision-support prototype, not a validated personal-safety service.
