import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";

// Gradient matches the requested scheme: green/blue = low, yellow = moderate,
// orange = high, red = very high crime density.
const HEAT_GRADIENT = {
  0.0: "#1d4ed8", // blue - very low
  0.3: "#22c55e", // green - low
  0.55: "#eab308", // yellow - moderate
  0.75: "#f97316", // orange - high
  1.0: "#dc2626", // red - very high
};

export default function HeatmapLayer({ incidents, visible }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    if (!visible || !incidents || incidents.length === 0) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    const points = incidents.map((inc) => [inc.lat, inc.lon, inc.severity_weight ?? 0.5]);

    if (layerRef.current) {
      layerRef.current.setLatLngs(points);
    } else {
      layerRef.current = L.heatLayer(points, {
        radius: 22,
        blur: 18,
        maxZoom: 15,
        max: 1.0,
        gradient: HEAT_GRADIENT,
      }).addTo(map);
    }

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, visible, map]);

  return null;
}
