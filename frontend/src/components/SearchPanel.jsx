import React, { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../api";

function fmt(p) {
  return p ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : "Not set yet";
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
    </svg>
  );
}

// One place box: type to search (Nominatim/Photon via the backend) or tap the
// mic to speak the place name. The chosen point is shown underneath.
function PlaceInput({ label, kind, point, picking, onSelect, onTogglePin, children }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [state, setState] = useState("idle"); // idle | empty | error
  const [listening, setListening] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState("");
  const recognitionRef = useRef(null);

  // Keep the box in sync when the point is set from elsewhere (my location, map pin).
  useEffect(() => {
    if (point?.label && point.label !== query) setQuery(point.label);
    if (!point) setQuery("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || text === point?.label) {
      setResults([]);
      setState("idle");
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setState("idle");
      try {
        const data = await searchPlaces(text);
        const list = Array.isArray(data) ? data : data.results || [];
        if (!cancelled) {
          setResults(list);
          setState(list.length ? "idle" : "empty");
        }
      } catch (e) {
        if (!cancelled) {
          setResults([]);
          setState("error");
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  function choose(place) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const text = place.display_name || place.name || "";
    onSelect(kind, { lat, lon, label: text });
    setQuery(text);
    setResults([]);
  }

  function startVoiceSearch() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setVoiceMsg("Voice search needs Chrome or Edge.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => {
      setListening(true);
      setVoiceMsg("Listening… say a place name");
    };
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript;
      setQuery(said);
      setVoiceMsg(`Heard “${said}”`);
    };
    rec.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setVoiceMsg("Microphone permission is blocked.");
      else if (e.error === "no-speech") setVoiceMsg("Didn't catch that — try again.");
      else if (e.error !== "aborted") setVoiceMsg(`Voice search error: ${e.error}`);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = rec;
    rec.start();
  }

  return (
    <div className="place">
      <label className="field-label" htmlFor={`place-${kind}`}>{label}</label>
      <div className="place-box">
        <input
          id={`place-${kind}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${label.toLowerCase()}…`}
          autoComplete="off"
        />
        <button
          type="button"
          className={listening ? "icon-btn mic listening" : "icon-btn mic"}
          onClick={startVoiceSearch}
          title="Voice search"
          aria-label={`Voice search for ${label.toLowerCase()}`}
        >
          <MicIcon />
        </button>
      </div>
      {voiceMsg && <div className="place-status">{voiceMsg}</div>}
      {searching && <div className="place-status">Searching places…</div>}
      {!searching && state === "empty" && (
        <div className="place-status">No places found — try a nearby town, or add the district.</div>
      )}
      {!searching && state === "error" && (
        <div className="place-status warn">Search service is busy or unreachable — please retry in a moment.</div>
      )}
      {results.length > 0 && (
        <div className="place-results">
          {results.map((p, i) => (
            <button type="button" key={`${p.place_id || i}`} onClick={() => choose(p)}>
              <b>{p.name || p.display_name}</b>
              {p.name && p.display_name && <span>{p.display_name}</span>}
            </button>
          ))}
        </div>
      )}
      <div className={`coord ${kind === "end" ? "coord-end" : "coord-start"}`}>
        <span className="dot">●</span>
        <span className="coord-text">{fmt(point)}</span>
        {children}
        <button type="button" className={picking ? "link-btn on" : "link-btn"} onClick={onTogglePin}>
          {picking ? "Click the map…" : "📍 Pin on map"}
        </button>
      </div>
    </div>
  );
}

const MODES = [
  ["car", "🚗", "Car"],
  ["two_wheeler", "🏍️", "Two-wheeler"],
  ["walking", "🚶", "Walking"],
];

const WEIGHTS = [
  ["aqi", "Air quality"],
  ["crime", "Crime context"],
  ["traffic", "Traffic"],
];

export default function SearchPanel({
  start,
  end,
  waypoints,
  pickingMode,
  onSetPickingMode,
  onSetPlace,
  onSwap,
  onRemoveWaypoint,
  onClearWaypoints,
  onReorderWaypoint,
  onUseMyLocation,
  locating,
  liveTracking,
  onToggleLiveTracking,
  voiceNavigation,
  onToggleVoiceNavigation,
  voiceStatus,
  mode,
  onModeChange,
  ranking,
  onRankingChange,
  weights,
  onWeightChange,
  onSearch,
  loading,
  error,
}) {
  const canSearch = start && end && !loading;

  function submit(e) {
    e.preventDefault();
    onSearch();
  }

  return (
    <form className="card plan" onSubmit={submit}>
      <div className="card-head">
        <div>
          <span className="eyebrow">YOUR JOURNEY</span>
          <h2>Plan a safer route</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onSwap} disabled={!start && !end} title="Swap start and destination" aria-label="Swap start and destination">⇅</button>
      </div>

      <PlaceInput
        label="START LOCATION"
        kind="start"
        point={start}
        picking={pickingMode === "start"}
        onSelect={onSetPlace}
        onTogglePin={() => onSetPickingMode(pickingMode === "start" ? null : "start")}
      >
        <button type="button" className="link-btn" onClick={onUseMyLocation} disabled={locating}>
          {locating ? "Locating…" : "🎯 My location"}
        </button>
      </PlaceInput>

      {waypoints.length > 0 && (
        <div className="stops">
          {waypoints.map((wp, i) => (
            <div className="stop-row" key={wp.id}>
              <span className="stop-dot" />
              <span className="stop-text">Stop {i + 1}: {fmt(wp)}</span>
              <button type="button" className="mini" onClick={() => onReorderWaypoint(i, -1)} disabled={i === 0} aria-label="Move stop up">↑</button>
              <button type="button" className="mini" onClick={() => onReorderWaypoint(i, 1)} disabled={i === waypoints.length - 1} aria-label="Move stop down">↓</button>
              <button type="button" className="mini danger" onClick={() => onRemoveWaypoint(i)} aria-label="Remove stop">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        <button
          type="button"
          className={pickingMode === "waypoint" ? "secondary full on" : "secondary full"}
          onClick={() => onSetPickingMode(pickingMode === "waypoint" ? null : "waypoint")}
        >
          {pickingMode === "waypoint" ? "Click the map to drop a stop…" : "+ Add intermediate stop"}
        </button>
        {waypoints.length > 0 && (
          <button type="button" className="secondary" onClick={onClearWaypoints}>Clear</button>
        )}
      </div>

      <PlaceInput
        label="DESTINATION"
        kind="end"
        point={end}
        picking={pickingMode === "end"}
        onSelect={onSetPlace}
        onTogglePin={() => onSetPickingMode(pickingMode === "end" ? null : "end")}
      />

      <span className="field-label">TRAVEL MODE</span>
      <div className="segmented" role="group" aria-label="Travel mode">
        {MODES.map(([v, icon, text]) => (
          <button type="button" key={v} className={mode === v ? "chosen" : ""} onClick={() => onModeChange(v)}>
            <span aria-hidden="true">{icon}</span> {text}
          </button>
        ))}
      </div>
      <p className="hint">
        {mode === "walking"
          ? "Walking time is estimated at about 5 km/h on pedestrian routes."
          : mode === "two_wheeler"
          ? "Two-wheeler time is estimated at up to 45 km/h average."
          : "Car time comes from the routing engine."}
      </p>

      <span className="field-label">RANKING METHOD</span>
      <div className="segmented" role="group" aria-label="Ranking method">
        <button type="button" className={ranking === "weighted" ? "chosen" : ""} onClick={() => onRankingChange("weighted")}>Weighted score</button>
        <button type="button" className={ranking === "pareto" ? "chosen" : ""} onClick={() => onRankingChange("pareto")}>Pareto trade-off</button>
      </div>

      {ranking === "weighted" && (
        <div className="weights">
          <div className="weights-title">
            <span className="field-label">RISK PRIORITIES</span>
            <span className="hint">{weights.aqi + weights.crime + weights.traffic}% total</span>
          </div>
          {WEIGHTS.map(([key, name]) => (
            <div className="weight" key={key}>
              <div><span>{name}</span><b>{weights[key]}%</b></div>
              <input
                type="range"
                min="0"
                max="100"
                value={weights[key]}
                onChange={(e) => onWeightChange(key, Number(e.target.value))}
                aria-label={`${name} priority`}
              />
            </div>
          ))}
        </div>
      )}

      <span className="field-label">NAVIGATION</span>
      <div className="toggles">
        <button type="button" className={liveTracking ? "toggle on" : "toggle"} onClick={onToggleLiveTracking} aria-pressed={liveTracking}>
          <span className="toggle-icon">📡</span>
          <span><b>Live tracking</b><small>{liveTracking ? "Following you, watching for drift" : "Follow my position on the map"}</small></span>
        </button>
        <button type="button" className={voiceNavigation ? "toggle on" : "toggle"} onClick={onToggleVoiceNavigation} aria-pressed={voiceNavigation}>
          <span className="toggle-icon">🔊</span>
          <span><b>Voice guidance</b><small>{voiceStatus}</small></span>
        </button>
      </div>

      <button className="primary" type="submit" disabled={!canSearch}>
        {loading ? "Analysing route…" : "↗  Find routes"}
      </button>
      {!start || !end ? <p className="hint center">Set a start and destination to continue.</p> : null}
      {error && <div className="error" role="alert">{error}</div>}
    </form>
  );
}
