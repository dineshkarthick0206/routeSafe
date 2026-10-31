import React from "react";
import { ROUTE_COLORS } from "./RouteMap";
import { arrivalClock, formatDuration } from "../utils/geo";

const MODE_LABEL = { car: "Car", two_wheeler: "Two-wheeler", walking: "Walking" };
const MODE_ICON = { car: "🚗", two_wheeler: "🏍️", walking: "🚶" };

function crimeLabel(v) {
  if (v < 0.2) return "Low";
  if (v < 0.45) return "Moderate";
  if (v < 0.7) return "High";
  return "Very high";
}

export default function RouteCards({ routes, selectedIndex, onSelect, currentMode }) {
  if (!routes || routes.length === 0) {
    return (
      <div className="empty">
        <div className="empty-symbol">⌁</div>
        <h3>Plan your journey</h3>
        <p>
          Choose a start and destination (type, speak, pin on the map, or use your location), then run the analysis.
          Route options will appear here.
        </p>
      </div>
    );
  }

  const staleMode = routes[0].mode && routes[0].mode !== currentMode;

  return (
    <div className="route-list">
      {staleMode && (
        <div className="notice">
          Travel mode changed to {MODE_LABEL[currentMode]} — press <b>Find routes</b> to update times and scores.
        </div>
      )}
      {routes.map((route, i) => {
        const selected = i === selectedIndex;
        const color = ROUTE_COLORS[i] || "#94a3b8";
        const crime = Number(route.avg_crime_score ?? 0);
        return (
          <button
            type="button"
            key={route.route_index}
            className={selected ? "route-card active" : "route-card"}
            style={{ borderLeftColor: color }}
            onClick={() => onSelect(i)}
            aria-pressed={selected}
          >
            <div className="route-top">
              <span className="route-badge" style={{ background: color }}>{i === 0 ? "Recommended" : `Alternative ${i}`}</span>
              <span className="route-mode">{MODE_ICON[route.mode]} {MODE_LABEL[route.mode]}</span>
              <span className="score">{Number(route.composite_score).toFixed(1)}<small> risk</small></span>
            </div>

            <div className="metrics">
              <div><small>DISTANCE</small><b>{route.distance_km} km</b></div>
              <div><small>TRAVEL TIME</small><b>{formatDuration(route.duration_min)}</b></div>
              <div><small>AVG AQI*</small><b>{route.avg_aqi ?? "-"}</b></div>
              <div><small>CRIME INDEX</small><b>{crime.toFixed(2)} <em>{crimeLabel(crime)}</em></b></div>
            </div>

            <div className="eta">Arrive ~{arrivalClock(route.duration_min)} if you leave now</div>

            <p className="advisory">{route.advisory}</p>

            {route.crime_breakdown?.length > 0 && (
              <div className="units">
                <small>Crime by area ({route.crime_breakdown[0].year}, real CSV rates)</small>
                <div className="chips">
                  {route.crime_breakdown.map((u) => (
                    <span className="chip" key={u.unit} title={`IPC rate ${u.ipc_crime_rate} per lakh`}>
                      <i style={{ background: `hsl(${Math.round(120 - 120 * u.crime_index)} 80% 45%)` }} />
                      {u.unit} {u.crime_index.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {route.crime_coverage < 1 && (
              <p className="units-note">
                Crime data covers {Math.round((route.crime_coverage ?? 0) * 100)}% of this route (the rest is outside
                Tamil Nadu).
              </p>
            )}
            {route.routing_profile === "driving_estimate" && route.mode !== "car" && (
              <p className="units-note">
                Pedestrian routing was unavailable, so this follows the road route; time is estimated for {MODE_LABEL[route.mode].toLowerCase()}.
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
