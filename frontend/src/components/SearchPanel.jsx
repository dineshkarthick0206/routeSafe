import React, { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../api";

function fmt(point) {
  if (!point) return "Not set";
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}



function PlaceSearchInput({ label, kind, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState("idle"); // idle | empty | error
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      setSearchState("idle");
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchState("idle");
      try {
        const data = await searchPlaces(text);
        const list = Array.isArray(data) ? data : data.results || [];
        if (!cancelled) {
          setResults(list);
          setSearchState(list.length ? "idle" : "empty");
        }
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setSearchState("error");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function selectPlace(place) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    onSelect(kind, lat, lon);
    setQuery(place.display_name || place.name || "");
    setResults([]);
  }

  function startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser. Please use Google Chrome.");
      return;
    }
    if (recognitionRef.current) recognitionRef.current.stop();
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => setQuery(event.results[0][0].transcript);
    recognition.onerror = (event) => {
      console.error("Voice search error:", event.error);
      setListening(false);
      if (event.error !== "aborted") alert("Voice recognition error: " + event.error);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <div className="place-search">
      <div className="place-search-label">{label}</div>
      <div className="place-search-input-wrap">
        <svg className="ps-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()} location...`}
          autoComplete="off"
        />
        <button type="button" className={listening ? "place-search-mic listening" : "place-search-mic"} onClick={startVoiceSearch} title="Voice search" aria-label="Voice search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" />
          </svg>
        </button>
      </div>
      {searching && <div className="place-search-status">Searching places…</div>}
      {!searching && searchState === "empty" && (
        <div className="place-search-status">No places found - try a nearby town, or add the district/state.</div>
      )}
      {!searching && searchState === "error" && (
        <div className="place-search-status">Search service is busy or unreachable - please retry in a moment.</div>
      )}
      {results.length > 0 && (
        <div className="place-search-results">
          {results.map((place, index) => (
            <button type="button" key={`${place.place_id || index}`} className="place-search-result" onClick={() => selectPlace(place)}>
              <strong>{place.name || place.display_name}</strong>
              {place.name && place.display_name && <span>{place.display_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

  function handlePlaceSelect(kind, lat, lon) {
    onManualSet(kind, lat, lon);
  }

  return (
    <form className="search-panel" onSubmit={handleSubmit}>
      <h2>Plan a Safe Route</h2>

      <PlaceSearchInput label="Start" kind="start" onSelect={handlePlaceSelect} />

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
      <PlaceSearchInput label="Destination" kind="destination" onSelect={handlePlaceSelect} />
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
