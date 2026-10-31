import React, { useState } from "react";

const LAYERS = [
  { key: "heatmap", label: "Crime heatmap", note: "simulated, anchored to CSV rates" },
  { key: "hotspots", label: "Hotspot boundaries", note: "simulated" },
  { key: "markers", label: "Incident markers", note: "simulated" },
  { key: "districts", label: "District crime index", note: "real CSV data" },
];

export default function LayerPanel({ layers, onToggle, loading }) {
  const [open, setOpen] = useState(() => (typeof window === "undefined" ? true : window.innerWidth > 700 && window.innerHeight > 560));

  return (
    <div className={open ? "layer-panel open" : "layer-panel"}>
      <button type="button" className="layer-panel-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>🗺️ Crime layers{loading ? " · updating…" : ""}</span>
        <span className="chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="layer-panel-body">
          {LAYERS.map((l) => (
            <label className="layer-toggle" key={l.key}>
              <input type="checkbox" checked={!!layers[l.key]} onChange={() => onToggle(l.key)} />
              <span>
                {l.label}
                <small>{l.note}</small>
              </span>
            </label>
          ))}
          <div className="heat-scale" aria-label="Heatmap colour scale">
            <span>Low</span>
            <i />
            <span>High</span>
          </div>
          <div className="district-scale" aria-label="District index colour scale">
            <span>Low index</span>
            <i />
            <span>High index</span>
          </div>
          <p className="layer-note">
            Heatmap, hotspots and markers are a rate-anchored simulation (no public incident-level data exists for
            Tamil Nadu). District circles are the real CSV rates.
          </p>
        </div>
      )}
    </div>
  );
}
