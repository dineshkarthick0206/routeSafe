import React from "react";
import { CircleMarker, Tooltip } from "react-leaflet";

// Real data layer: one circle per police unit, coloured and sized by the
// crime index computed from the CSV (IPC + violent + property crime rates).
export function indexColor(index) {
  const hue = Math.round(120 - 120 * Math.min(1, Math.max(0, index)));
  return `hsl(${hue} 80% 45%)`;
}

export default function DistrictLayer({ units, visible }) {
  if (!visible || !units || units.length === 0) return null;
  return (
    <>
      {units.map((u) => (
        <CircleMarker
          key={u.unit}
          center={[u.lat, u.lon]}
          radius={6 + u.crime_index * 10}
          pathOptions={{
            color: "#0b1220",
            weight: 1.5,
            fillColor: indexColor(u.crime_index),
            fillOpacity: 0.8,
          }}
        >
          <Tooltip direction="top">
            <div className="district-tip">
              <strong>{u.unit}</strong>
              <div>Crime index {u.crime_index.toFixed(2)} ({u.year})</div>
              <div>IPC rate {u.ipc_crime_rate} / lakh</div>
              <div>Violent {u.violent_crime_rate} · Property {u.property_crime_rate}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
