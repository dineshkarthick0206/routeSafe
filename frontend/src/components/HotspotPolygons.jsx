import React from "react";
import { Polygon, Tooltip } from "react-leaflet";

const RISK_STYLE = {
  moderate: { color: "#eab308", fillColor: "#eab308" },
  high: { color: "#f97316", fillColor: "#f97316" },
  very_high: { color: "#dc2626", fillColor: "#dc2626" },
};

const RISK_LABEL = {
  moderate: "Moderate risk",
  high: "High risk",
  very_high: "Very high risk",
};

export default function HotspotPolygons({ hotspots, visible }) {
  if (!visible || !hotspots || hotspots.length === 0) return null;

  return (
    <>
      {hotspots.map((h) => {
        const style = RISK_STYLE[h.risk_level] || RISK_STYLE.moderate;
        return (
          <Polygon
            key={h.cluster_id}
            positions={h.polygon}
            pathOptions={{
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: 0.15,
              weight: 2,
              dashArray: "6 4",
            }}
          >
            <Tooltip sticky>
              <div className="hotspot-tooltip">
                <strong>{RISK_LABEL[h.risk_level]}</strong>
                <div>{h.district}</div>
                <div>{h.point_count} incidents &middot; mostly {h.dominant_crime_type}</div>
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}
