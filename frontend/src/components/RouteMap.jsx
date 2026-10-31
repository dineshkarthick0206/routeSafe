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
import DistrictLayer from "./DistrictLayer";

// Fix default marker icon paths (a common Leaflet + bundler gotcha)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const ROUTE_COLORS = ["#22c55e", "#f59e0b", "#ef4444"]; // best -> worst

function pinIcon(kind) {
  const glyphs = { start: "A", destination: "B", waypoint: "•" };
  const colors = { start: "#22c55e", destination: "#ef4444", waypoint: "#3b82f6" };
  return L.divIcon({
    className: "pin-marker",
    html: `<span style="background:${colors[kind]}">${glyphs[kind] || ""}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const liveIcon = L.divIcon({
  className: "live-location-marker",
  html: '<span class="pulse-dot"></span>',
  iconSize: [18, 18],
});

// Leaflet inside flexbox/grid can compute its size before layout settles;
// re-measure on mount and whenever the container (or window height) changes.
function MapAutoResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const timeoutId = setTimeout(() => map.invalidateSize(), 150);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

function FitBounds({ routes, start, end, waypoints }) {
  const map = useMap();
  useEffect(() => {
    const pts = [];
    if (routes && routes.length) routes.forEach((r) => pts.push(...r.geometry));
    if (start) pts.push([start.lat, start.lon]);
    if (end) pts.push([end.lat, end.lon]);
    if (waypoints) waypoints.forEach((wp) => pts.push([wp.lat, wp.lon]));
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, start, end, waypoints]);
  return null;
}

function ClickToPickHandler({ pickingMode, onPick }) {
  useMapEvents({
    click(e) {
      if (pickingMode) onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FollowLive({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && position) map.panTo([position.lat, position.lon], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position, follow]);
  return null;
}

export default function RouteMap({
  routes = [],
  selectedIndex = 0,
  onSelectRoute,
  start,
  end,
  waypoints = [],
  pickingMode,
  onPick,
  onDragStart,
  onDragEnd,
  onDragWaypoint,
  incidents = [],
  hotspots = [],
  districtUnits = [],
  layerVisibility,
  liveLocation,
  followLive = false,
}) {
  const center = start ? [start.lat, start.lon] : [11.1271, 78.6569]; // Tamil Nadu centroid

  // Draw the selected route last so it sits on top.
  const order = routes.map((_, i) => i).sort((a, b) => (a === selectedIndex) - (b === selectedIndex));

  return (
    <MapContainer
      center={center}
      zoom={7}
      style={{ height: "100%", width: "100%" }}
      className={pickingMode ? "picking-mode" : ""}
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Dark">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Light">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
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
            attribution="Map data: &copy; OpenStreetMap contributors, SRTM | Style: &copy; OpenTopoMap (CC-BY-SA)"
            url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      <ClickToPickHandler pickingMode={pickingMode} onPick={onPick} />

      {/* Crime layers sit under the route lines */}
      <HeatmapLayer incidents={incidents} visible={layerVisibility.heatmap} />
      <HotspotPolygons hotspots={hotspots} visible={layerVisibility.hotspots} />
      <IncidentClusterLayer incidents={incidents} visible={layerVisibility.markers} />
      <DistrictLayer units={districtUnits} visible={layerVisibility.districts} />

      {order.map((i) => {
        const route = routes[i];
        const selected = i === selectedIndex;
        return (
          <Polyline
            key={route.route_index}
            positions={route.geometry}
            pathOptions={{
              color: ROUTE_COLORS[i] || "#94a3b8",
              weight: selected ? 7 : 4,
              opacity: selected ? 0.95 : 0.5,
            }}
            eventHandlers={{ click: () => onSelectRoute && onSelectRoute(i) }}
          />
        );
      })}

      {start && (
        <Marker
          position={[start.lat, start.lon]}
          icon={pinIcon("start")}
          draggable
          eventHandlers={{
            dragend: (e) => onDragStart && onDragStart(e.target.getLatLng().lat, e.target.getLatLng().lng),
          }}
        >
          <Popup>Start{start.label ? `: ${start.label}` : ""}</Popup>
        </Marker>
      )}
      {end && (
        <Marker
          position={[end.lat, end.lon]}
          icon={pinIcon("destination")}
          draggable
          eventHandlers={{
            dragend: (e) => onDragEnd && onDragEnd(e.target.getLatLng().lat, e.target.getLatLng().lng),
          }}
        >
          <Popup>Destination{end.label ? `: ${end.label}` : ""}</Popup>
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
          <Marker position={[liveLocation.lat, liveLocation.lon]} icon={liveIcon}>
            <Popup>You are here</Popup>
          </Marker>
        </>
      )}

      <FollowLive position={liveLocation} follow={followLive} />
      <FitBounds routes={routes} start={start} end={end} waypoints={waypoints} />
      <MapAutoResize />
    </MapContainer>
  );
}
