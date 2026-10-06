import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";

const SEVERITY_COLOR = {
  Low: "#22c55e",
  Medium: "#f97316",
  High: "#dc2626",
};

function severityIcon(severity) {
  const color = SEVERITY_COLOR[severity] || "#94a3b8";
  return L.divIcon({
    className: "incident-marker",
    html: `<span style="background:${color}"></span>`,
    iconSize: [14, 14],
  });
}

function formatHour(hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h}:00 ${ampm}`;
}

export default function IncidentClusterLayer({ incidents, visible }) {
  const map = useMap();
  const clusterRef = useRef(null);

  useEffect(() => {
    if (!visible || !incidents || incidents.length === 0) {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
      return;
    }

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

    const cluster = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      disableClusteringAtZoom: 17,
    });

    incidents.forEach((inc) => {
      const marker = L.marker([inc.lat, inc.lon], { icon: severityIcon(inc.severity) });
      marker.bindPopup(
        `<div class="incident-popup">
           <strong>${inc.crime_type}</strong>
           <span class="incident-popup-severity sev-${inc.severity.toLowerCase()}">${inc.severity} severity</span>
           <div class="incident-popup-row">📅 ${inc.date} &middot; ${formatHour(inc.hour)}</div>
           <div class="incident-popup-row">📍 ${inc.district}</div>
           <div class="incident-popup-note">Synthetic point, rate-anchored to real district data</div>
         </div>`
      );
      cluster.addLayer(marker);
    });

    cluster.addTo(map);
    clusterRef.current = cluster;

    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, visible, map]);

  return null;
}
