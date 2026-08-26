import { useEffect, useState } from "react";
import SstMap from "./SstMap";
import Colorbar from "./Colorbar";
import { fetchSst, fetchSstDefault, fetchLand } from "../api";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function LasView({ onSwitch }) {
  const [data, setData] = useState(null);
  const [available, setAvailable] = useState([]);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [land, setLand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLand().then(setLand).catch((e) => setError(e.message));
  }, []);

  // First load discovers which months exist.
  useEffect(() => {
    fetchSstDefault()
      .then((d) => {
        setData(d);
        setAvailable(d.available);
        setYear(d.year);
        setMonth(d.month);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Refetch on dropdown change.
  useEffect(() => {
    if (year == null || month == null) return;
    if (data && data.year === year && data.month === month) return;

    let cancelled = false;
    setLoading(true);
    fetchSst(year, month)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [year, month, data]);

  const years = [...new Set(available.map((a) => a.year))];
  const monthsForYear = available
    .filter((a) => a.year === year)
    .map((a) => a.month);

  return (
    <div className="las">
      <header className="las-header">
        <div>
          <h1>OceanScope — 2D Reference</h1>
          <p>Indian Ocean · NOAA OISST v2.1 · LAS-style map</p>
        </div>
        <button className="switch" onClick={onSwitch}>
          3D prototype →
        </button>
      </header>

      <div className="las-controls">
        <label>
          Variable
          <select value="sst" onChange={() => {}}>
            <option value="sst">Sea-surface temperature</option>
          </select>
        </label>

        <label>
          Year
          <select
            value={year ?? ""}
            disabled={!years.length}
            onChange={(e) => {
              const y = Number(e.target.value);
              setYear(y);
              // Keep the month valid for the newly selected year.
              const months = available.filter((a) => a.year === y).map((a) => a.month);
              if (!months.includes(month)) setMonth(months[0]);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label>
          Month
          <select
            value={month ?? ""}
            disabled={!monthsForYear.length}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthsForYear.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m - 1]}</option>
            ))}
          </select>
        </label>

        <span className="status">
          {loading ? "loading…" : data ? `${data.shape[0]}×${data.shape[1]} grid` : ""}
        </span>
      </div>

      <Colorbar
        min={data?.range.min}
        max={data?.range.max}
        units="°C"
        label={data?.variable_label ?? "Sea-surface temperature"}
      />

      <SstMap data={data} land={land} range={data?.range} />

      <footer className="las-footer">
        <span>
          {data
            ? `${MONTH_NAMES[data.month - 1]} ${data.year} · ${data.range.min}–${data.range.max} °C`
            : "—"}
        </span>
        <span className="dim">
          Drag to pan · scroll to zoom · land and no-data cells are grey
        </span>
      </footer>

      {error && <div className="las-error">⚠ {error}</div>}
    </div>
  );
}
