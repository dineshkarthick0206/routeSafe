// Haversine distance in meters between two [lat, lon] points.
export function haversineMeters([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Index of the polyline vertex closest to a point, plus that distance (meters).
export function nearestVertex(point, polyline) {
  let bestIndex = 0;
  let best = Infinity;
  for (let i = 0; i < polyline.length; i += 1) {
    const d = haversineMeters(point, polyline[i]);
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { index: bestIndex, distance: best };
}

// Approximate distance (meters) from a point to a polyline (nearest vertex;
// route polylines are dense enough for drift detection).
export function distanceToPolylineMeters(point, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  return nearestVertex(point, polyline).distance;
}

// 185 -> "3 h 5 min", 42 -> "42 min", 2400 -> "1 d 16 h"
export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return "-";
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days} d ${hours} h`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}

// Same thing as words a speech engine reads naturally.
export function spokenDuration(minutes) {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} minutes`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return mins
    ? `${hours} ${hours === 1 ? "hour" : "hours"} ${mins} minutes`
    : `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

// Clock time at which you would arrive if you left now.
export function arrivalClock(minutes) {
  const d = new Date(Date.now() + minutes * 60000);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
}
