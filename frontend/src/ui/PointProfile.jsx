import { useMemo } from "react";
import { getCachedField } from "../api";
import { sampleValueAt, haversineKm } from "../grid";

const W = 320;
const H = 300;
const PAD = { top: 16, right: 18, bottom: 40, left: 52 };

const ARGO_RADIUS_KM = 50; // "is there a real instrument near this point?"

const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;

/**
 * Drill-down for one point of ocean: the full depth profile at that lat/lon.
 *
 * Every depth level is read SYNCHRONOUSLY from the client-side slice cache
 * (App prefetches all depths for the current variable/timestep), so opening
 * this panel costs no network round-trip.
 */
export default function PointProfile({ point, variable, units, label, timestep,
                                       monthLabel, depths, floats, onClose, closing }) {
  const model = useMemo(() => {
    if (!point) return [];
    return depths
      .map((depth) => {
        const slice = getCachedField(variable, depth, timestep);
        if (!slice) return null; // not cached yet
        const value = sampleValueAt(slice, point.lat, point.lon);
        return value == null ? null : { depth, value };
      })
      .filter(Boolean);
  }, [point, variable, timestep, depths]);

  // STRETCH: overlay a real Argo profile if one sits within ~50 km.
  const nearby = useMemo(() => {
    if (!point || !floats?.length) return null;
    let best = null;
    for (const f of floats) {
      const km = haversineKm(point.lat, point.lon, f.lat, f.lon);
      if (km <= ARGO_RADIUS_KM && (!best || km < best.km)) best = { float: f, km };
    }
    return best;
  }, [point, floats]);

  if (!point) return null;

  // Argo profiles carry temperature/salinity; only overlay a matching variable.
  const argoKey = variable === "salinity" ? "salinity" : "temperature";
  const argoPoints =
    nearby && (variable === "temperature" || variable === "salinity")
      ? nearby.float.profile
          .filter((p) => p[argoKey] != null && p.depth <= 520)
          .map((p) => ({ depth: p.depth, value: p[argoKey] }))
      : [];

  const all = [...model, ...argoPoints];
  const hasData = model.length > 0;

  const vMin = hasData ? Math.min(...all.map((p) => p.value)) : 0;
  const vMax = hasData ? Math.max(...all.map((p) => p.value)) : 1;
  const dMax = Math.max(...depths, ...argoPoints.map((p) => p.depth), 1);

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const pad = (vMax - vMin) * 0.08 || 0.5;

  const x = (v) => PAD.left + ((v - (vMin - pad)) / (vMax - vMin + pad * 2)) * innerW;
  const y = (d) => PAD.top + (d / dMax) * innerH; // surface at top, deep at bottom

  const line = (pts) =>
    pts.map((p, i) => `${i ? "L" : "M"}${x(p.value).toFixed(1)},${y(p.depth).toFixed(1)}`).join("");

  const vTicks = [vMin, (vMin + vMax) / 2, vMax];

  return (
    <aside className={`side-panel point-panel${closing ? " closing" : ""}`} role="dialog" aria-label="Point depth profile">
      <header className="side-panel-head">
        <div>
          <h2 className="panel-title">Depth profile</h2>
          <p className="panel-sub">
            {fmtLat(point.lat)} · {fmtLon(point.lon)}
          </p>
          <p className="panel-sub muted">
            {label} · {monthLabel}
          </p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close profile">
          ×
        </button>
      </header>

      {!hasData ? (
        <p className="panel-empty">No data in this column — the point is over land.</p>
      ) : (
        <>
          <svg className="profile-chart" viewBox={`0 0 ${W} ${H}`} role="img"
               aria-label={`${label} against depth`}>
            {depths.map((d) => (
              <g key={d}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(d)} y2={y(d)} className="grid-line" />
                <text x={PAD.left - 10} y={y(d) + 4} className="axis-text" textAnchor="end">
                  {d}
                </text>
              </g>
            ))}
            {vTicks.map((v, i) => (
              <text key={i} x={x(v)} y={H - PAD.bottom + 20} className="axis-text"
                    textAnchor="middle">
                {v.toFixed(1)}
              </text>
            ))}

            {argoPoints.length > 0 && (
              <path d={line(argoPoints)} className="profile-line argo" />
            )}
            <path d={line(model)} className="profile-line model" />
            {model.map((p) => (
              <circle key={p.depth} cx={x(p.value)} cy={y(p.depth)} r="3.5"
                      className="profile-dot" />
            ))}

            <text x={PAD.left - 38} y={PAD.top + innerH / 2} className="axis-title"
                  transform={`rotate(-90 ${PAD.left - 38} ${PAD.top + innerH / 2})`}
                  textAnchor="middle">
              Depth (m)
            </text>
            <text x={PAD.left + innerW / 2} y={H - 6} className="axis-title" textAnchor="middle">
              {label} ({units})
            </text>
          </svg>

          <ul className="legend-list">
            <li>
              <span className="swatch-line model" aria-hidden="true" />
              INCOIS analysis · {model.length} levels
            </li>
            {argoPoints.length > 0 ? (
              <li>
                <span className="swatch-line argo" aria-hidden="true" />
                {nearby.float.id} · {nearby.km.toFixed(0)} km away
              </li>
            ) : (
              <li className="muted">No Argo float within {ARGO_RADIUS_KM} km</li>
            )}
          </ul>

          <dl className="stat-row">
            {model.slice(0, 3).map((p) => (
              <div key={p.depth}>
                <dt>{p.depth} m</dt>
                <dd>{p.value.toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}
