import React from "react";
import { arrivalClock, formatDuration } from "../utils/geo";

const MODE_ICON = { car: "🚗", two_wheeler: "🏍️", walking: "🚶" };

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent ? `kpi-${accent}` : ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

export default function KpiBar({ route }) {
  if (!route) {
    return (
      <div className="kpi-bar kpi-empty">
        Choose a start and destination, then press <b>Find routes</b> to see distance, time, air quality and crime for
        each option.
      </div>
    );
  }
  const score = route.composite_score;
  const accent = score < 33 ? "good" : score < 66 ? "warn" : "bad";
  return (
    <div className="kpi-bar">
      <Kpi label="RISK SCORE" value={`${Number(score).toFixed(1)}`} sub="out of 100, lower is better" accent={accent} />
      <Kpi label="DISTANCE" value={`${route.distance_km} km`} />
      <Kpi
        label={`TRAVEL TIME ${MODE_ICON[route.mode] || ""}`}
        value={formatDuration(route.duration_min)}
        sub={`arrive ~${arrivalClock(route.duration_min)}`}
      />
      <Kpi label="AVG AQI" value={route.avg_aqi ?? "-"} />
      <Kpi label="PEAK CRIME INDEX" value={Number(route.max_crime_score ?? 0).toFixed(2)} sub="0 low – 1 high" />
    </div>
  );
}
