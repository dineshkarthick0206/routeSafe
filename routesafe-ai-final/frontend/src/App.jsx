import React, { useCallback, useEffect, useState } from "react";
import RouteMap from "./components/RouteMap";
import SearchPanel from "./components/SearchPanel";
import RouteCards from "./components/RouteCards";
import KpiBar from "./components/KpiBar";
import TimeSlider from "./components/TimeSlider";
import MapLegend from "./components/MapLegend";
import useLiveLocation from "./hooks/useLiveLocation";
import useVoiceNavigation from "./hooks/useVoiceNavigation";
import { distanceToPolylineMeters } from "./utils/geo";
import { getSafeRoutes, getCrimeHeatmap } from "./api";

let waypointIdCounter = 1;

// Meters of drift from the active route before we surface a "recalculate?" banner.
const DRIFT_THRESHOLD_M = { car: 150, two_wheeler: 100, walking: 40 };

export default function App() {
  // --- Location state -----------------------------------------------
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [pickingMode, setPickingMode] = useState(null);

  // --- Search params ---------------------------------------------------
  const [mode, setMode] = useState("car");
  const [ranking, setRanking] = useState("weighted");
  const [weightAqi, setWeightAqi] = useState(33);
  const [weightCrime, setWeightCrime] = useState(34);
  const [weightTraffic, setWeightTraffic] = useState(33);

  // --- Results ----------------------------------------------------------
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- Live location ------------------------------------------------
  const live = useLiveLocation();
  const [locatingOnce, setLocatingOnce] = useState(false);
  const [liveTracking, setLiveTracking] = useState(false);
  const [driftedOffRoute, setDriftedOffRoute] = useState(false);
  const [voiceNavigation, setVoiceNavigation] = useState(false);

  // --- Crime map layers -----------------------------------------------
  const [month, setMonth] = useState(0); // 0 = all months
  const [hourBandKey, setHourBandKey] = useState("all");
  const [incidents, setIncidents] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [totalIncidents, setTotalIncidents] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({ heatmap: true, markers: false, hotspots: true });

  const HOUR_RANGES = {
    all: null,
    morning: [6, 11],
    afternoon: [12, 16],
    evening: [17, 20],
    night: [21, 5],
  };

  // Load crime heatmap data whenever the time filter changes
  useEffect(() => {
    let cancelled = false;
    getCrimeHeatmap({ month: month || undefined, hourRange: HOUR_RANGES[hourBandKey] })
      .then((data) => {
        if (cancelled) return;
        setIncidents(data.incidents);
        setHotspots(data.hotspots);
        setTotalIncidents(data.total_incidents);
      })
      .catch(() => {
        if (!cancelled) {
          setIncidents([]);
          setHotspots([]);
        }
      });
    return () => { cancelled = true; };
  }, [month, hourBandKey]);

  // --- Picking / manual set handlers -----------------------------------
  const handlePick = useCallback(
    (lat, lon) => {
      if (pickingMode === "start") setStartPoint([lat, lon]);
      else if (pickingMode === "destination") setEndPoint([lat, lon]);
      else if (pickingMode === "waypoint") {
        setWaypoints((wps) => [...wps, { id: waypointIdCounter++, lat, lon }]);
      }
      setPickingMode(null);
    },
    [pickingMode]
  );

  const handleManualSet = useCallback((kind, lat, lon) => {
    if (kind === "start") setStartPoint([lat, lon]);
    else if (kind === "destination") setEndPoint([lat, lon]);
  }, []);

  const handleRemoveWaypoint = useCallback((index) => {
    setWaypoints((wps) => wps.filter((_, i) => i !== index));
  }, []);

  const handleReorderWaypoint = useCallback((index, direction) => {
    setWaypoints((wps) => {
      const next = [...wps];
      const target = index + direction;
      if (target < 0 || target >= next.length) return wps;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  // --- Live location handlers -------------------------------------------
  async function handleUseMyLocation() {
    setLocatingOnce(true);
    setError(null);
    try {
      const pos = await live.getCurrentPositionOnce();
      setStartPoint([pos.lat, pos.lon]);
    } catch (e) {
      setError("Couldn't get your location. Check browser location permissions.");
    } finally {
      setLocatingOnce(false);
    }
  }

  function handleToggleLiveTracking() {
    if (liveTracking) {
      live.stopTracking();
      setLiveTracking(false);
      setDriftedOffRoute(false);
    } else {
      live.startTracking();
      setLiveTracking(true);
    }
  }

  // Off-route drift detection while live-tracking with an active route
  useEffect(() => {
    if (!liveTracking || !live.position || routes.length === 0) {
      setDriftedOffRoute(false);
      return;
    }
    const topRoute = routes[0];
    const dist = distanceToPolylineMeters([live.position.lat, live.position.lon], topRoute.geometry);
    const threshold = DRIFT_THRESHOLD_M[mode] || 100;
    setDriftedOffRoute(dist > threshold);
  }, [live.position, liveTracking, routes, mode]);

  async function handleRecalculateFromCurrentLocation() {
    if (!live.position) return;
    setStartPoint([live.position.lat, live.position.lon]);
    await runSearch({ overrideStart: [live.position.lat, live.position.lon] });
  }

  // --- Search -------------------------------------------------------
  function handleWeightChange(key, value) {
    if (key === "aqi") setWeightAqi(value);
    if (key === "crime") setWeightCrime(value);
    if (key === "traffic") setWeightTraffic(value);
  }

  async function runSearch({ overrideStart } = {}) {
    const s = overrideStart || startPoint;
    if (!s || !endPoint) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getSafeRoutes({
        startLat: s[0],
        startLon: s[1],
        endLat: endPoint[0],
        endLon: endPoint[1],
        waypoints,
        mode,
        weightAqi: weightAqi / 100,
        weightCrime: weightCrime / 100,
        weightTraffic: weightTraffic / 100,
        ranking,
      });
      setRoutes(data.routes);
      setDriftedOffRoute(false);
    } catch (e) {
      if (e.code === "ECONNABORTED") {
        setError("The request timed out. Long routes can take a while - the server may be waking up. Please try again in a moment.");
      } else if (e.response?.status === 504) {
        setError(e.response.data?.detail || "Route analysis timed out. Please try again.");
      } else if (e.response) {
        setError(`Server error (${e.response.status}): ${e.response.data?.detail || "please try again."}`);
      } else {
        setError("Can't reach the backend. Check your internet connection or that the server is running.");
      }
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }

  function handleToggleLayer(key) {
    setLayerVisibility((v) => ({ ...v, [key]: !v[key] }));
  }

  const topRoute = routes.length > 0 ? routes[0] : null;

  const voice = useVoiceNavigation({
    enabled: voiceNavigation,
    position: live.position,
    route: topRoute,
    destination: endPoint,
  });

  function handleToggleVoiceNavigation() {
    if (!voice.supported) {
      setError("Voice navigation is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (!liveTracking) {
      setError("Turn on Live tracking first to use voice navigation.");
      return;
    }

    if (!topRoute) {
      setError("Find a route first, then start voice navigation.");
      return;
    }

    setError(null);
    setVoiceNavigation((current) => !current);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <span className="app-logo">🛡️</span>
          <div>
            <h1>RouteSafe AI</h1>
            <p>Multi-modal route recommendations fusing air quality, traffic, and crime risk.</p>
          </div>
        </div>
      </header>

      <KpiBar topRoute={topRoute} />

      <div className="app-body">
        <aside className="sidebar glass-panel">
          <SearchPanel
            startPoint={startPoint}
            endPoint={endPoint}
            waypoints={waypoints}
            pickingMode={pickingMode}
            onSetPickingMode={setPickingMode}
            onManualSet={handleManualSet}
            onRemoveWaypoint={handleRemoveWaypoint}
            onReorderWaypoint={handleReorderWaypoint}
            onUseMyLocation={handleUseMyLocation}
            locating={locatingOnce}
            liveTracking={liveTracking}
            onToggleLiveTracking={handleToggleLiveTracking}
            mode={mode}
            onModeChange={setMode}
            ranking={ranking}
            onRankingChange={setRanking}
            weightAqi={weightAqi}
            weightCrime={weightCrime}
            weightTraffic={weightTraffic}
            onWeightChange={handleWeightChange}
            onSearch={runSearch}
            loading={loading}
          />

          {live.error && liveTracking && <div className="error-banner">{live.error}</div>}
          {error && <div className="error-banner">{error}</div>}

          <div className="voice-navigation-panel">
            <div>
              <strong>🔊 Voice Navigation</strong>
              <p>{voice.status}</p>
            </div>
            <button
              type="button"
              className={voiceNavigation ? "voice-nav-btn active" : "voice-nav-btn"}
              onClick={handleToggleVoiceNavigation}
            >
              {voiceNavigation ? "Stop Voice" : "Start Voice"}
            </button>
          </div>

          <RouteCards routes={routes} />
        </aside>

        <main className="map-area">
          {driftedOffRoute && (
            <div className="drift-banner glass-panel">
              You've drifted off the recommended route.
              <button onClick={handleRecalculateFromCurrentLocation}>Recalculate from here</button>
            </div>
          )}

          <RouteMap
            routes={routes}
            startPoint={startPoint}
            endPoint={endPoint}
            waypoints={waypoints}
            pickingMode={pickingMode}
            onPick={handlePick}
            onDragStart={(lat, lon) => setStartPoint([lat, lon])}
            onDragEnd={(lat, lon) => setEndPoint([lat, lon])}
            onDragWaypoint={(i, lat, lon) =>
              setWaypoints((wps) => wps.map((wp, idx) => (idx === i ? { ...wp, lat, lon } : wp)))
            }
            incidents={incidents}
            hotspots={hotspots}
            layerVisibility={layerVisibility}
            liveLocation={live.position}
            followLive={liveTracking}
          />

          <MapLegend layers={layerVisibility} onToggle={handleToggleLayer} />

          <TimeSlider
            month={month}
            onMonthChange={setMonth}
            hourBandKey={hourBandKey}
            onHourBandChange={setHourBandKey}
            totalIncidents={totalIncidents}
          />
        </main>
      </div>
    </div>
  );
}
