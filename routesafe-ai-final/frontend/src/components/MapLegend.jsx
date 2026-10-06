import React from "react";

export default function MapLegend({ layers, onToggle }) {
  return (
    <div className="map-legend glass-panel">
      <div className="legend-title">Crime Layers</div>

      <label className="legend-toggle">
        <input type="checkbox" checked={layers.heatmap} onChange={() => onToggle("heatmap")} />
        Heatmap
      </label>
      <div className="legend-gradient">
        <span className="grad-swatch grad-low" /> Low
        <span className="grad-swatch grad-mod" /> Moderate
        <span className="grad-swatch grad-high" /> High
        <span className="grad-swatch grad-vhigh" /> Very high
      </div>

      <label className="legend-toggle">
        <input type="checkbox" checked={layers.markers} onChange={() => onToggle("markers")} />
        Incident markers
      </label>

      <label className="legend-toggle">
        <input type="checkbox" checked={layers.hotspots} onChange={() => onToggle("hotspots")} />
        Hotspot boundaries
      </label>
    </div>
  );
}
