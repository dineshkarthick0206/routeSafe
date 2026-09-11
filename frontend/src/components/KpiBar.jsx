import React from "react";

function Kpi({ label, value, accent }) {
  return (
    <div className={`kpi-card ${accent ? `kpi-accent-${accent}` : ""}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export default function KpiBar({ topRoute }) {
  if (!topRoute) {
    return (
      <div className="kpi-bar kpi-bar-empty">
        <span>Pin a start and destination, then find a safe route to see live risk KPIs here.</span>
      </div>
    );
  }

  const scoreAccent = topRoute.composite_score < 33 ? "good" : topRoute.composite_score < 66 ? "warn" : "bad";

  return (
    <div className="kpi-bar">
      <Kpi label="Risk Score" value={`${topRoute.composite_score}/100`} accent={scoreAccent} />
      <Kpi label="Distance" value={`${topRoute.distance_km} km`} />
      <Kpi label="Duration" value={`${topRoute.duration_min} min`} />
      <Kpi label="Avg AQI" value={topRoute.avg_aqi} />
      <Kpi label="Peak Crime Risk" value={`${topRoute.max_crime_score}/100`} />
    </div>
  );
}
