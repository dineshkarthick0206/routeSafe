import React from "react";

const MONTHS = ["All", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const HOUR_BANDS = [
  { key: "all", label: "All day", range: null },
  { key: "morning", label: "Morning", sub: "6AM–11AM", range: [6, 11] },
  { key: "afternoon", label: "Afternoon", sub: "12PM–4PM", range: [12, 16] },
  { key: "evening", label: "Evening", sub: "5PM–8PM", range: [17, 20] },
  { key: "night", label: "Night", sub: "9PM–5AM", range: [21, 5] },
];

export default function TimeSlider({ month, onMonthChange, hourBandKey, onHourBandChange, totalIncidents }) {
  const activeBand = HOUR_BANDS.find((b) => b.key === hourBandKey) || HOUR_BANDS[0];

  return (
    <div className="time-filter">
      <div className="time-filter-title">
        <span className="eyebrow">TIME FILTER</span>
        <span className="time-filter-readout">
          <b>{MONTHS[month]}</b> · <b>{activeBand.label}</b>
          {activeBand.sub ? ` (${activeBand.sub})` : ""}
          {typeof totalIncidents === "number" ? ` · ${totalIncidents.toLocaleString()} points` : ""}
        </span>
      </div>
      <div className="time-filter-month">
        <input
          type="range"
          min={0}
          max={12}
          step={1}
          value={month}
          onChange={(e) => onMonthChange(Number(e.target.value))}
          aria-label="Month filter"
        />
        <div className="month-ticks" aria-hidden="true">
          {MONTHS.map((m, i) => (
            <span key={m} className={i === month ? "tick active" : "tick"}>{m}</span>
          ))}
        </div>
      </div>
      <div className="band-row" role="group" aria-label="Time of day">
        {HOUR_BANDS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={b.key === hourBandKey ? "band-btn active" : "band-btn"}
            onClick={() => onHourBandChange(b.key)}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
