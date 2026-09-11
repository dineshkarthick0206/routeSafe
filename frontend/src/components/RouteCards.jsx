import React from "react";

const ROUTE_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];
const LABELS = ["Recommended", "Alternative", "Alternative"];

export default function RouteCards({ routes }) {
  if (!routes || routes.length === 0) return null;

  return (
    <div className="route-cards">
      {routes.map((route, i) => (
        <div className="route-card" key={route.route_index} style={{ borderLeftColor: ROUTE_COLORS[i] }}>
          <div className="route-card-header">
            <span className="route-badge" style={{ background: ROUTE_COLORS[i] }}>
              {LABELS[i] || "Alternative"}
            </span>
            <span className="composite-score">Risk Score: {route.composite_score}/100</span>
          </div>

          <div className="route-stats">
            <div><strong>{route.distance_km} km</strong><span>Distance</span></div>
            <div><strong>{route.duration_min} min</strong><span>Duration</span></div>
            <div><strong>{route.avg_aqi}</strong><span>Avg AQI</span></div>
            <div><strong>{route.max_crime_score}</strong><span>Peak Crime Risk</span></div>
          </div>

          <p className="advisory">{route.advisory}</p>
        </div>
      ))}
    </div>
  );
}
