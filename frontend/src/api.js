import axios from "axios";

// In dev, Vite proxies /api to localhost:8000 (see vite.config.js).
// In production, set VITE_API_BASE_URL to your deployed backend URL.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 90000,
});

export async function getSafeRoutes({
  startLat,
  startLon,
  endLat,
  endLon,
  waypoints = [], // [{lat, lon}, ...] in visit order
  mode,
  weightAqi,
  weightCrime,
  weightTraffic,
  ranking,
}) {
  const response = await client.post("/api/routes/safe-route", {
    start_lat: startLat,
    start_lon: startLon,
    end_lat: endLat,
    end_lon: endLon,
    waypoints: waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon })),
    mode,
    weight_aqi: weightAqi,
    weight_crime: weightCrime,
    weight_traffic: weightTraffic,
    ranking,
  });
  return response.data;
}

// month: 1-12 or null/undefined for "all months"
// hourRange: [hourMin, hourMax] (0-23 inclusive) or null for "all hours"
export async function getCrimeHeatmap({ month, hourRange } = {}) {
  const params = {};
  if (month) params.month = month;
  if (hourRange) {
    params.hour_min = hourRange[0];
    params.hour_max = hourRange[1];
  }
  const response = await client.get("/api/crime/heatmap", { params });
  return response.data;
}

export async function getCrimeMeta() {
  const response = await client.get("/api/crime/meta");
  return response.data;
}
