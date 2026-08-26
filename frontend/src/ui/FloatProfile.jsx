import { useEffect, useState } from "react";
import { fetchField } from "../api";
import { sampleValueAt } from "../grid";

const W = 300;
const H = 300;
const PAD = { top: 14, right: 16, bottom: 34, left: 46 };

/**
 * Real depth profile for one Argo float, drawn as a plain SVG line chart (no
 * chart library). Depth increases downward, as oceanographers expect.
 *
 * "Compare to model" overlays the INCOIS analysis sampled at this float's own
 * lat/lon. This is the PRIMARY route to the model-vs-instrument comparison:
 * float markers are clickable at any zoom, whereas the terrain-click path
 * needs the click to land within 50 km of a float, which is only a few pixels
 * when zoomed out.
 */
export default function FloatProfile({
  float: f,
  onClose,
  closing,
  variable,
  label,
  units,
  timestep,
  depths,
  monthLabel,
}) {
  const [compare, setCompare] = useState(false);
  const [model, setModel] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modelError, setModelError] = useState(null);

  // Reset the comparison whenever a different float (or slice) is shown.
  useEffect(() => {
    setCompare(false);
    setModel([]);
    setModelError(null);
  }, [f?.id, variable, timestep]);

  // Same depth-profile logic as the terrain-click panel, with the float's own
  // coordinates. Already-cached depths resolve without a network round-trip.
  useEffect(() => {
    if (!compare || !f) return;
    let cancelled = false;
    setLoading(true);
    setModelError(null);

    Promise.all(
      depths.map((d) =>
        fetchField(variable, d, timestep)
          .then((slice) => {
            const v = sampleValueAt(slice, f.lat, f.lon);
            return v == null ? null : { depth: d, value: v };
          })
          .catch(() => null),
      ),
    )
      .then((rows) => {
        if (cancelled) return;
        const pts = rows.filter(Boolean);
        setModel(pts);
        if (!pts.length) setModelError("No model data at this float's position.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compare, f, variable, timestep, depths]);

  if (!f) return null;

  // Argo profiles carry both temperature and salinity; plot whichever variable
  // is active so the two lines are always the same quantity.
  const key = variable === "salinity" ? "salinity" : "temperature";
  const pts = f.profile.filter((p) => p[key] != null);

  if (!pts.length) {
    return (
      <aside className={closing ? "float-panel closing" : "float-panel"} role="dialog">
        <header className="float-head">
          <div>
            <h2 className="panel-title">{f.id}</h2>
            <p className="panel-sub">
              {f.lat.toFixed(2)}° {f.lat >= 0 ? "N" : "S"} · {f.lon.toFixed(2)}° E
            </p>
          </div>
          <button className="float-close" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </header>
        <p className="panel-empty">This float reports no {label.toLowerCase()} data.</p>
      </aside>
    );
  }

  const shown = compare ? model : [];
  const values = [...pts.map((p) => p[key]), ...shown.map((p) => p.value)];
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const dMax = Math.max(...pts.map((p) => p.depth));

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (v) => PAD.left + ((v - vMin) / (vMax - vMin || 1)) * innerW;
  const y = (d) => PAD.top + (d / (dMax || 1)) * innerH;

  const argoPath = pts
    .map((p, i) => `${i ? "L" : "M"}${x(p[key]).toFixed(1)},${y(p.depth).toFixed(1)}`)
    .join("");
  const modelPath = shown
    .map((p, i) => `${i ? "L" : "M"}${x(p.value).toFixed(1)},${y(p.depth).toFixed(1)}`)
    .join("");

  const depthTicks = [0, 250, 500, 750, 1000].filter((d) => d <= dMax);
  const valueTicks = [vMin, (vMin + vMax) / 2, vMax];

  return (
    <aside
      className={closing ? "float-panel closing" : "float-panel"}
      role="dialog"
      aria-label={`Profile for ${f.id}`}
    >
      <header className="float-head">
        <div>
          <h2 className="panel-title">{f.id}</h2>
          <p className="panel-sub">
            {f.lat.toFixed(2)}° {f.lat >= 0 ? "N" : "S"} · {f.lon.toFixed(2)}° E ·{" "}
            {f.time.slice(0, 10)}
          </p>
        </div>
        <button className="float-close" onClick={onClose} aria-label="Close profile">
          ×
        </button>
      </header>

      <svg
        className="profile-chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Depth versus ${label.toLowerCase()} profile`}
      >
        {depthTicks.map((d) => (
          <g key={d}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(d)} y2={y(d)} className="grid-line" />
            <text x={PAD.left - 8} y={y(d) + 4} className="axis-text" textAnchor="end">
              {d}
            </text>
          </g>
        ))}
        {valueTicks.map((v, i) => (
          <text key={i} x={x(v)} y={H - PAD.bottom + 18} className="axis-text" textAnchor="middle">
            {v.toFixed(1)}
          </text>
        ))}

        {/* Gold dashed = instrument, cyan = model. Same meaning in both charts. */}
        <path d={argoPath} className="profile-line argo" />
        {compare && shown.length > 0 && <path d={modelPath} className="profile-line model" />}
        {compare &&
          shown.map((p) => (
            <circle key={p.depth} cx={x(p.value)} cy={y(p.depth)} r="3.5" className="profile-dot" />
          ))}

        <text
          x={PAD.left - 34}
          y={PAD.top + innerH / 2}
          className="axis-title"
          transform={`rotate(-90 ${PAD.left - 34} ${PAD.top + innerH / 2})`}
          textAnchor="middle"
        >
          Depth (m)
        </text>
        <text x={PAD.left + innerW / 2} y={H - 4} className="axis-title" textAnchor="middle">
          {label} ({units})
        </text>
      </svg>

      <button
        className={compare ? "ghost-button active" : "ghost-button"}
        onClick={() => setCompare((c) => !c)}
        aria-pressed={compare}
      >
        {loading ? "Loading model…" : compare ? "Hide model comparison" : "Compare to model"}
      </button>

      <ul className="legend-list">
        <li>
          <span className="swatch-line argo" aria-hidden="true" />
          Argo float {f.id} · {pts.length} levels
        </li>
        {compare && shown.length > 0 && (
          <li>
            <span className="swatch-line model" aria-hidden="true" />
            INCOIS analysis · {monthLabel}
          </li>
        )}
        {compare && modelError && <li className="muted">{modelError}</li>}
      </ul>

      <dl className="float-stats">
        <div>
          <dt>Surface</dt>
          <dd>{pts[0][key].toFixed(2)}</dd>
        </div>
        <div>
          <dt>At {Math.round(dMax)} m</dt>
          <dd>{pts[pts.length - 1][key].toFixed(2)}</dd>
        </div>
        <div>
          <dt>Levels</dt>
          <dd>{f.n_levels}</dd>
        </div>
      </dl>

      <p className="float-note">Real Argo profile · IFREMER ERDDAP</p>
    </aside>
  );
}
