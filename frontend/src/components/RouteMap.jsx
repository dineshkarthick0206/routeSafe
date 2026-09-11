import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  LayersControl,
  Polyline,
  Marker,
  Circle,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import HeatmapLayer from "./HeatmapLayer";
import IncidentClusterLayer from "./IncidentClusterLayer";
import HotspotPolygons from "./HotspotPolygons";

// Fix default marker icon paths (a common Leaflet + bundler gotcha)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const ROUTE_COLORS = ["#22c55e", "#f59e0b", "#ef4444"]; // green=best, amber, red=worst

function pinIcon(kind) {
  const glyphs = { start: "A", destination: "B", waypoint: "•" };
  const colors = { start: "#22c55e", destination: "#ef4444", waypoint: "#3b82f6" };
  return L.divIcon({
    className: "pin-marker",
    html: `<span style="background:${colors[kind]}">${glyphs[kind] || ""}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // Fixes a classic react-leaflet-in-flexbox issue: Leaflet can compute its
    // initial pixel origin before the flex layout has settled on a final
    // size, which leaves markers positioned using a stale offset. Re-run
    // invalidateSize() once after mount and again on any container resize.
    const timeoutId = setTimeout(() => map.invalidateSize(), 150);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

function FitBounds({ routes, startPoint, endPoint, waypoints }) {
  const map = useMap();

  useEffect(() => {
    const pts = [];
    if (routes && routes.length) routes.forEach((r) => pts.push(...r.geometry));
    if (startPoint) pts.push(startPoint);
    if (endPoint) pts.push(endPoint);
    if (waypoints) waypoints.forEach((wp) => pts.push([wp.lat, wp.lon]));

    if (pts.length === 0) return;
    const bounds = L.latLngBounds(pts);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, startPoint, endPoint, waypoints]);

  return null;
}

function ClickToPickHandler({ pickingMode, onPick }) {
  useMapEvents({
    click(e) {
      if (pickingMode) {
        onPick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

function FollowLive({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && position) {
      map.panTo([position.lat, position.lon], { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, follow]);
  return null;
}

export default function RouteMap({
  routes = [],
  startPoint,
  endPoint,
  waypoints = [],
  pickingMode,
  onPick,
  onDragStart,
  onDragEnd,
  onDragWaypoint,
  incidents = [],
  hotspots = [],
  layerVisibility = { heatmap: true, markers: false, hotspots: true },
  liveLocation,
  followLive = false,
}) {
  const center = startPoint || [11.1271, 78.6569]; // default: Tamil Nadu centroid

  return (
    <MapContainer
      center={center}
      zoom={7}
      style={{ height: "100%", width: "100%" }}
      className={pickingMode ? "picking-mode" : ""}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer name="Dark">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer checked name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; OpenTopoMap (CC-BY-SA)'
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <ClickToPickHandler pickingMode={pickingMode} onPick={onPick} />

      {startPoint && (
        <Marker
          position={startPoint}
          icon={pinIcon("start")}
          draggable
          eventHandlers={{
            dragend: (e) => onDragStart && onDragStart(e.target.getLatLng().lat, e.target.getLatLng().lng),
          }}
        >
          <Popup>Start</Popup>
        </Marker>
      )}
      {endPoint && (
        <Marker
          position={endPoint}
          icon={pinIcon("destination")}
          draggable
          eventHandlers={{
            dragend: (e) => onDragEnd && onDragEnd(e.target.getLatLng().lat, e.target.getLatLng().lng),
          }}
        >
          <Popup>Destination</Popup>
        </Marker>
      )}
      {waypoints.map((wp, i) => (
        <Marker
          key={wp.id ?? i}
          position={[wp.lat, wp.lon]}
          icon={pinIcon("waypoint")}
          draggable
          eventHandlers={{
            dragend: (e) => onDragWaypoint && onDragWaypoint(i, e.target.getLatLng().lat, e.target.getLatLng().lng),
          }}
        >
          <Popup>Stop {i + 1}</Popup>
        </Marker>
      ))}

      {liveLocation && (
        <>
          <Circle
            center={[liveLocation.lat, liveLocation.lon]}
            radius={liveLocation.accuracy || 30}
            pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.12, weight: 1 }}
          />
          <Marker
            position={[liveLocation.lat, liveLocation.lon]}
            icon={L.divIcon({ className: "live-location-marker", html: `<span class="pulse-dot"></span>`, iconSize: [18, 18] })}
          >
            <Popup>You are here</Popup>
          </Marker>
        </>
      )}

      {routes.map((route, i) => (
        <Polyline
          key={route.route_index}
          positions={route.geometry}
          pathOptions={{
            color: ROUTE_COLORS[i] || "#94a3b8",
            weight: i === 0 ? 6 : 4,
            opacity: i === 0 ? 0.95 : 0.55,
          }}
        />
      ))}

      <HeatmapLayer incidents={incidents} visible={layerVisibility.heatmap} />
      <IncidentClusterLayer incidents={incidents} visible={layerVisibility.markers} />
      <HotspotPolygons hotspots={hotspots} visible={layerVisibility.hotspots} />

      <FollowLive position={liveLocation} follow={followLive} />
      <FitBounds routes={routes} startPoint={startPoint} endPoint={endPoint} waypoints={waypoints} />
      <MapAutoResize />
    </MapContainer>
  );
}
