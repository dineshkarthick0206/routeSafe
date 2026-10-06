// Author: Devanandh S
// Reg No: 24MID0296

import React, { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../api";
import { Mic, Search } from 'lucide-react';

function fmt(point) {
  if (!point) return "Not set";
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

function PlaceSearchInput({ label, kind, onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchPlaces(text);
        if (!cancelled) setResults(Array.isArray(data) ? data : data.results || []);
      } catch (e) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
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
      <div className="search-input-container">
        <Search className="search-icon" size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()} location...`}
          autoComplete="off"
          className="custom-search-input"
        />
        <button 
          type="button" 
          className={`voice-search-btn ${listening ? 'active' : ''}`} 
          onClick={startVoiceSearch} 
          title="Voice search"
        >
          <Mic size={18} />
        </button>
      </div>
      {searching && <div className="place-search-status">Searching places…</div>}
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