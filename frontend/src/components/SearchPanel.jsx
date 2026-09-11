import React, { useState } from "react";

function fmt(point) {
  if (!point) return "Not set";
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

export default function SearchPanel({
  startPoint,
  endPoint,
  waypoints,
  pickingMode,
  onSetPickingMode,
  onManualSet,
  onRemoveWaypoint,
  onReorderWaypoint,
  onUseMyLocation,
  locating,
  liveTracking,
  onToggleLiveTracking,
  mode,
  onModeChange,
  ranking,
  onRankingChange,
  weightAqi,
  weightCrime,
  weightTraffic,
  onWeightChange,
  onSearch,
  loading,
}) {
  const [manualText, setManualText] = useState({ start: "", destination: "" });

  function handleManualApply(kind) {
    const raw = manualText[kind];
    const [lat, lon] = raw.split(",").map((s) => parseFloat(s.trim()));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    onManualSet(kind, lat, lon);
    setManualText((m) => ({ ...m, [kind]: "" }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSearch();
  }

  const canSearch = startPoint && endPoint && !loading;

  return (
    <form className="search-panel" onSubmit={handleSubmit}>
      <h2>Plan a Safe Route</h2>

      {/* Start */}
      <div className="location-field">
        <div className="location-field-label">
          <span className="pin-dot pin-start" /> Start
        </div>
        <div className="location-value">{fmt(startPoint)}</div>
        <div className="location-actions">
          <button
            type="button"
            className={pickingMode === "start" ? "pin-btn active" : "pin-btn"}
            onClick={() => onSetPickingMode(pickingMode === "start" ? null : "start")}
          >
            {pickingMode === "start" ? "Click the map…" : "📍 Pin on map"}
          </button>
          <button type="button" className="pin-btn" onClick={onUseMyLocation} disabled={locating}>
            {locating ? "Locating…" : "🎯 Use my location"}
          </button>
        </div>
        <details className="manual-entry">
          <summary>Enter coordinates manually</summary>
          <div className="manual-entry-row">
            <input
              placeholder="13.0604,80.2496"
              value={manualText.start}
              onChange={(e) => setManualText((m) => ({ ...m, start: e.target.value }))}
            />
            <button type="button" onClick={() => handleManualApply("start")}>Set</button>
          </div>
        </details>
      </div>

      {/* Waypoints */}
      {waypoints.length > 0 && (
        <div className="waypoints-list">
          {waypoints.map((wp, i) => (
            <div className="location-field waypoint-field" key={wp.id}>
              <div className="location-field-label">
                <span className="pin-dot pin-waypoint" /> Stop {i + 1}
              </div>
              <div className="location-value">{fmt([wp.lat, wp.lon])}</div>
              <div className="location-actions">
                <button type="button" className="pin-btn" onClick={() => onReorderWaypoint(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" className="pin-btn" onClick={() => onReorderWaypoint(i, 1)} disabled={i === waypoints.length - 1}>↓</button>
                <button type="button" className="pin-btn danger" onClick={() => onRemoveWaypoint(i)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={pickingMode === "waypoint" ? "add-stop-btn active" : "add-stop-btn"}
        onClick={() => onSetPickingMode(pickingMode === "waypoint" ? null : "waypoint")}
      >
        {pickingMode === "waypoint" ? "Click the map to add a stop…" : "+ Add stop"}
      </button>

      {/* Destination */}
      <div className="location-field">
        <div className="location-field-label">
          <span className="pin-dot pin-destination" /> Destination
        </div>
        <div className="location-value">{fmt(endPoint)}</div>
        <div className="location-actions">
          <button
            type="button"
            className={pickingMode === "destination" ? "pin-btn active" : "pin-btn"}
            onClick={() => onSetPickingMode(pickingMode === "destination" ? null : "destination")}
          >
            {pickingMode === "destination" ? "Click the map…" : "📍 Pin on map"}
          </button>
        </div>
        <details className="manual-entry">
          <summary>Enter coordinates manually</summary>
          <div className="manual-entry-row">
            <input
              placeholder="13.0067,80.2206"
              value={manualText.destination}
              onChange={(e) => setManualText((m) => ({ ...m, destination: e.target.value }))}
            />
            <button type="button" onClick={() => handleManualApply("destination")}>Set</button>
          </div>
        </details>
      </div>

      <label className="live-tracking-toggle">
        <input type="checkbox" checked={liveTracking} onChange={onToggleLiveTracking} />
        Live tracking (follow me &amp; watch for drift)
      </label>

      <label>
        Mode of travel
        <select value={mode} onChange={(e) => onModeChange(e.target.value)}>
          <option value="car">Car</option>
          <option value="two_wheeler">Two-wheeler</option>
          <option value="walking">Walking</option>
        </select>
      </label>

      <label>
        Ranking method
        <select value={ranking} onChange={(e) => onRankingChange(e.target.value)}>
          <option value="weighted">Weighted sum (use sliders below)</option>
          <option value="pareto">Pareto-optimal (no dominated routes)</option>
        </select>
      </label>

      {ranking === "weighted" && (
        <div className="weights">
          <label>
            Air Quality priority: {weightAqi}%
            <input type="range" min="0" max="100" value={weightAqi}
              onChange={(e) => onWeightChange("aqi", Number(e.target.value))} />
          </label>
          <label>
            Crime Safety priority: {weightCrime}%
            <input type="range" min="0" max="100" value={weightCrime}
              onChange={(e) => onWeightChange("crime", Number(e.target.value))} />
          </label>
          <label>
            Traffic priority: {weightTraffic}%
            <input type="range" min="0" max="100" value={weightTraffic}
              onChange={(e) => onWeightChange("traffic", Number(e.target.value))} />
          </label>
        </div>
      )}

      <button type="submit" className="find-route-btn" disabled={!canSearch}>
        {loading ? "Finding safest route…" : "Find Safe Route"}
      </button>
      {!startPoint || !endPoint ? (
        <div className="hint-text">Pin a start and destination to continue.</div>
      ) : null}
    </form>
  );
}
