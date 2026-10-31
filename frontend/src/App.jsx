import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RouteMap from "./components/RouteMap";
import SearchPanel from "./components/SearchPanel";
import RouteCards from "./components/RouteCards";
import KpiBar from "./components/KpiBar";
import TimeSlider, { HOUR_BANDS } from "./components/TimeSlider";
import LayerPanel from "./components/LayerPanel";
import useLiveLocation from "./hooks/useLiveLocation";
import useVoiceNavigation from "./hooks/useVoiceNavigation";
import { distanceToPolylineMeters } from "./utils/geo";
import { getSafeRoutes, getCrimeHeatmap, getCrimeUnits, healthCheck } from "./api";

let waypointId = 1;

// Meters of drift from the selected route before offering "Recalculate from here".
const DRIFT_THRESHOLD_M = { car: 150, two_wheeler: 100, walking: 40 };

// Move one slider and spread the remainder over the other two so they total 100.
function rebalance(prev, key, value) {
  const others = Object.keys(prev).filter((k) => k !== key);
  const remaining = 100 - value;
  const sum = others.reduce((s, k) => s + prev[k], 0);
  const next = { ...prev, [key]: value };
  if (sum === 0) {
    next[others[0]] = remaining;
    next[others[1]] = 0;
  } else {
    const first = Math.round((remaining * prev[others[0]]) / sum);
    next[others[0]] = first;
    next[others[1]] = remaining - first;
  }
  return next;
}

function explainError(e) {
  if (e.code === "ECONNABORTED") {
    return "The request timed out. Long routes can take a while and a free server may be waking up — please try again.";
  }
  if (e.response?.status === 504) return e.response.data?.detail || "Route analysis timed out. Please try again.";
  if (e.response) return `Server error (${e.response.status}): ${e.response.data?.detail || "please try again."}`;
  return "Can't reach the backend. Check that the server is running and your internet connection.";
}

export default function App() {
  // --- Places ------------------------------------------------------------
  const [start, setStart] = useState(null); // { lat, lon, label? }
  const [end, setEnd] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [pickingMode, setPickingMode] = useState(null); // start | end | waypoint | null

  // --- Options -----------------------------------------------------------
  const [mode, setMode] = useState("car");
  const [ranking, setRanking] = useState("weighted");
  const [weights, setWeights] = useState({ aqi: 33, crime: 34, traffic: 33 });

  // --- Results -----------------------------------------------------------
  const [routes, setRoutes] = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState("checking");
  const resultsRef = useRef(null);

  // --- Live location & voice ---------------------------------------------
  const live = useLiveLocation();
  const [locating, setLocating] = useState(false);
  const [liveTracking, setLiveTracking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);

  // --- Crime map layers --------------------------------------------------
  const [month, setMonth] = useState(0);
  const [hourBand, setHourBand] = useState("all");
  const [incidents, setIncidents] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [totalIncidents, setTotalIncidents] = useState(null);
  const [heatLoading, setHeatLoading] = useState(false);
  const [districtUnits, setDistrictUnits] = useState([]);
  const [layers, setLayers] = useState({ heatmap: true, hotspots: true, markers: false, districts: false });

  useEffect(() => {
    healthCheck().then(() => setApiStatus("connected")).catch(() => setApiStatus("offline"));
    getCrimeUnits().then(setDistrictUnits).catch(() => setDistrictUnits([]));
  }, []);

  // Reload heatmap data when the time filter changes
  useEffect(() => {
    let cancelled = false;
    const band = HOUR_BANDS.find((b) => b.key === hourBand);
    setHeatLoading(true);
    getCrimeHeatmap({ month: month || undefined, hourRange: band?.range ?? null })
      .then((data) => {
        if (cancelled) return;
        setIncidents(data.incidents);
        setHotspots(data.hotspots);
        setTotalIncidents(data.total_incidents);
      })
      .catch(() => {
        if (cancelled) return;
        setIncidents([]);
        setHotspots([]);
        setTotalIncidents(null);
      })
      .finally(() => {
        if (!cancelled) setHeatLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, hourBand]);

  const route = routes[selected] || null;

  // --- Drift detection ---------------------------------------------------
  const offRoute = useMemo(() => {
    if (!liveTracking || !live.position || !route) return false;
    const d = distanceToPolylineMeters([live.position.lat, live.position.lon], route.geometry);
    return d > (DRIFT_THRESHOLD_M[mode] || 100);
  }, [liveTracking, live.position, route, mode]);

  const voice = useVoiceNavigation({
    enabled: voiceOn,
    position: live.position,
    route,
    destination: end,
    offRoute,
  });

  // --- Place handlers ----------------------------------------------------
  const handlePick = useCallback(
    (lat, lon) => {
      if (pickingMode === "start") setStart({ lat, lon, label: "Pinned start" });
      else if (pickingMode === "end") setEnd({ lat, lon, label: "Pinned destination" });
      else if (pickingMode === "waypoint") setWaypoints((w) => [...w, { id: waypointId++, lat, lon }]);
      setPickingMode(null);
    },
    [pickingMode]
  );

  const handleSetPlace = useCallback((kind, point) => {
    if (kind === "start") setStart(point);
    else setEnd(point);
  }, []);

  function handleSwap() {
    setStart(end);
    setEnd(start);
  }

  function reorderWaypoint(index, direction) {
    setWaypoints((w) => {
      const target = index + direction;
      if (target < 0 || target >= w.length) return w;
      const next = [...w];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // --- Live location -----------------------------------------------------
  async function handleUseMyLocation() {
    setLocating(true);
    setError(null);
    try {
      const pos = await live.getCurrentPositionOnce();
      setStart({ lat: pos.lat, lon: pos.lon, label: "My location" });
    } catch (e) {
      setError("Couldn't get your location. Allow location access in the browser and try again (HTTPS or localhost is required).");
    } finally {
      setLocating(false);
    }
  }

  function startTracking() {
    live.startTracking();
    setLiveTracking(true);
  }

  function handleToggleLiveTracking() {
    if (liveTracking) {
      live.stopTracking();
      setLiveTracking(false);
      setVoiceOn(false);
    } else {
      startTracking();
    }
  }

  function handleToggleVoice() {
    if (voiceOn) {
      setVoiceOn(false);
      return;
    }
    if (!voice.supported) {
      setError("Voice guidance is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (!route) {
      setError("Find a route first, then turn on voice guidance.");
      return;
    }
    setError(null);
    if (!liveTracking) startTracking(); // guidance needs your live position
    setVoiceOn(true);
  }

  // --- Search ------------------------------------------------------------
  async function runSearch(overrideStart) {
    const s = overrideStart || start;
    if (!s || !end) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSafeRoutes({
        start_lat: s.lat,
        start_lon: s.lon,
        end_lat: end.lat,
        end_lon: end.lon,
        waypoints: waypoints.map((w) => ({ lat: w.lat, lon: w.lon })),
        mode,
        weight_aqi: weights.aqi / 100,
        weight_crime: weights.crime / 100,
        weight_traffic: weights.traffic / 100,
        ranking,
      });
      const list = data.routes || [];
      setRoutes(list);
      setSelected(0);
      if (!list.length) setError("No route candidates were returned.");
      else setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80);
    } catch (e) {
      setError(explainError(e));
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }

  function handleRecalculate() {
    if (!live.position) return;
    const here = { lat: live.position.lat, lon: live.position.lon, label: "My location" };
    setStart(here);
    runSearch(here);
  }

  const statusText = apiStatus === "connected" ? "API connected" : apiStatus === "offline" ? "API offline" : "Connecting…";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-icon" aria-hidden="true">✦</div>
        <div className="brand-text">
          <h1>RouteSafe <em>AI</em></h1>
          <p>Route planning with air quality, crime and traffic indicators for Tamil Nadu</p>
        </div>
        <span className={`status ${apiStatus}`} role="status">{statusText}</span>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-plan">
            <SearchPanel
              start={start}
              end={end}
              waypoints={waypoints}
              pickingMode={pickingMode}
              onSetPickingMode={setPickingMode}
              onSetPlace={handleSetPlace}
              onSwap={handleSwap}
              onRemoveWaypoint={(i) => setWaypoints((w) => w.filter((_, j) => j !== i))}
              onClearWaypoints={() => setWaypoints([])}
              onReorderWaypoint={reorderWaypoint}
              onUseMyLocation={handleUseMyLocation}
              locating={locating}
              liveTracking={liveTracking}
              onToggleLiveTracking={handleToggleLiveTracking}
              voiceNavigation={voiceOn}
              onToggleVoiceNavigation={handleToggleVoice}
              voiceStatus={voice.status}
              mode={mode}
              onModeChange={setMode}
              ranking={ranking}
              onRankingChange={setRanking}
              weights={weights}
              onWeightChange={(key, value) => setWeights((w) => rebalance(w, key, value))}
              onSearch={() => runSearch()}
              loading={loading}
              error={error || (liveTracking ? live.error : null)}
            />
          </div>

          <div className="sidebar-results" ref={resultsRef}>
            <div className="results-head">
              <div>
                <span className="eyebrow">ROUTE ANALYSIS</span>
                <h2>{routes.length ? `${routes.length} route option${routes.length === 1 ? "" : "s"}` : "Your route options"}</h2>
              </div>
              {routes.length > 0 && <span className="hint">Tap a card or a line on the map</span>}
            </div>
            <RouteCards routes={routes} selectedIndex={selected} onSelect={setSelected} currentMode={mode} />
            <p className="disclaimer">
              Decision support only. Crime index: Tamil Nadu Police crime rates per lakh population (IPC, violent and
              property crime) by district / city commissionerate, scaled 0–1. Street-level detail, heatmap and hotspots
              are a rate-anchored simulation, not incident records. *AQI comes from OpenAQ where a station is nearby,
              otherwise a default; traffic is not live; walking and two-wheeler times are estimates. Not validated
              emergency guidance.
            </p>
          </div>
        </aside>

        <section className="workspace">
          <KpiBar route={route} />

          <div className="map-wrap">
            <RouteMap
              routes={routes}
              selectedIndex={selected}
              onSelectRoute={setSelected}
              start={start}
              end={end}
              waypoints={waypoints}
              pickingMode={pickingMode}
              onPick={handlePick}
              onDragStart={(lat, lon) => setStart({ lat, lon, label: "Pinned start" })}
              onDragEnd={(lat, lon) => setEnd({ lat, lon, label: "Pinned destination" })}
              onDragWaypoint={(i, lat, lon) => setWaypoints((w) => w.map((p, j) => (j === i ? { ...p, lat, lon } : p)))}
              incidents={incidents}
              hotspots={hotspots}
              districtUnits={districtUnits}
              layerVisibility={layers}
              liveLocation={live.position}
              followLive={liveTracking}
            />

            <LayerPanel layers={layers} onToggle={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))} loading={heatLoading} />

            {pickingMode && (
              <div className="map-hint">
                Click the map to set {pickingMode === "waypoint" ? "an intermediate stop" : pickingMode === "start" ? "the start" : "the destination"}
                <button type="button" onClick={() => setPickingMode(null)}>Cancel</button>
              </div>
            )}

            {offRoute && (
              <div className="drift-banner" role="alert">
                You've drifted off the selected route.
                <button type="button" onClick={handleRecalculate}>Recalculate from here</button>
              </div>
            )}
          </div>

          <TimeSlider
            month={month}
            onMonthChange={setMonth}
            hourBandKey={hourBand}
            onHourBandChange={setHourBand}
            totalIncidents={totalIncidents}
          />
        </section>
      </div>
    </div>
  );
}
