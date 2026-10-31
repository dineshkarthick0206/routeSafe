import axios from "axios";

// Dev: Vite proxies /api and /health to the backend (see vite.config.js), so the
// default empty base URL works locally and from a phone on the same Wi-Fi.
// Production: set VITE_API_BASE_URL to the deployed backend (e.g. your Render URL).
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const client = axios.create({ baseURL: BASE_URL, timeout: 110000 });

export async function healthCheck() {
  return (await client.get("/health", { timeout: 20000 })).data;
}

export async function searchPlaces(q) {
  return (await client.get("/api/places/search", { params: { q, limit: 5 } })).data;
}

export async function getSafeRoutes(payload) {
  return (await client.post("/api/routes/safe-route", payload)).data;
}

// month: 1-12 or undefined for all months; hourRange: [min, max] (0-23) or null
export async function getCrimeHeatmap({ month, hourRange } = {}) {
  const params = {};
  if (month) params.month = month;
  if (hourRange) {
    params.hour_min = hourRange[0];
    params.hour_max = hourRange[1];
  }
  return (await client.get("/api/crime/heatmap", { params })).data;
}

export async function getCrimeUnits() {
  return (await client.get("/api/crime/units")).data;
}
