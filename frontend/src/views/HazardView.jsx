import { useEffect, useState } from "react";

const SEVERITY_ORDER = { high: 0, moderate: 1, low: 2 };

function Severity({ level }) {
  return (
    <span className={`sev sev-${level}`}>
      <span className="sev-dot" aria-hidden="true" />
      {level}
    </span>
  );
}

/**
 * Hazard Advisory: a bulletin board over the risk-coloured terrain.
 *
 * The 3D scene stays mounted and simply re-colours to the Cyclone Heat
 * Potential field, so switching sections is a smooth transition rather than a
 * teardown. This panel is the "decision support" half: a ranked, plain-language
 * advisory list of the kind an operational centre actually issues.
 */
export default function HazardView({
  hazard,
  loading,
  timestep,
  timesteps,
  onTimestep,
  selectedId,
  onSelect,
}) {
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setExpanded(null);
  }, [timestep]);

  const advisories = hazard?.advisories ?? [];
  const sorted = [...advisories].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  const highest = sorted[0]?.severity ?? "none";

  return (
    <aside className="hazard-panel" aria-label="Hazard advisory bulletin">
      <header className="hazard-head">
        <div className="hazard-title-row">
          <h2 className="panel-title">Hazard Advisory</h2>
          <span className={`bulletin-state bulletin-${highest}`}>
            {advisories.length
              ? `${advisories.length} active`
              : loading
                ? "assessing…"
                : "no flags"}
          </span>
        </div>
        <p className="panel-sub">
          Cyclone Heat Potential · {hazard?.month_label ?? "—"}
        </p>
      </header>

      {/* Period selector: an advisory is meaningless without a date. */}
      <div className="hazard-period">
        <label className="field-label" htmlFor="hz-period">
          Assessment period
        </label>
        <select
          id="hz-period"
          className="select-native"
          value={timestep}
          onChange={(e) => onTimestep(Number(e.target.value))}
        >
          {timesteps.map((t) => (
            <option key={t.index} value={t.index}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <ol className="bulletin">
        {sorted.map((a) => {
          const isOpen = expanded === a.id;
          return (
            <li
              key={a.id}
              className={`bulletin-item${selectedId === a.id ? " selected" : ""}`}
            >
              <button
                className="bulletin-head"
                onClick={() => {
                  setExpanded(isOpen ? null : a.id);
                  onSelect(selectedId === a.id ? null : a);
                }}
                aria-expanded={isOpen}
              >
                <Severity level={a.severity} />
                <span className="bulletin-region">{a.region}</span>
                <span className="bulletin-metric">{a.peak_tchp} kJ/cm²</span>
              </button>

              {isOpen && (
                <div className="bulletin-body">
                  <p className="bulletin-headline">{a.headline}</p>
                  <p className="bulletin-detail">{a.detail}</p>
                  <dl className="bulletin-stats">
                    <div>
                      <dt>Peak TCHP</dt>
                      <dd>{a.peak_tchp}</dd>
                    </div>
                    <div>
                      <dt>26 °C depth</dt>
                      <dd>{a.d26} m</dd>
                    </div>
                    <div>
                      <dt>Extent</dt>
                      <dd>{a.area_cells} cells</dd>
                    </div>
                  </dl>
                  <p className="bulletin-where">
                    Centred near {Math.abs(a.lat).toFixed(1)}°{" "}
                    {a.lat >= 0 ? "N" : "S"}, {Math.abs(a.lon).toFixed(1)}°{" "}
                    {a.lon >= 0 ? "E" : "W"} — highlighted on the map.
                  </p>
                </div>
              )}
            </li>
          );
        })}

        {!sorted.length && !loading && (
          <li className="bulletin-empty">
            No region exceeds the {hazard?.thresholds?.moderate ?? 50} kJ/cm²
            advisory threshold for this period.
          </li>
        )}
      </ol>

      <footer className="hazard-method">
        <p className="panel-sub muted">{hazard?.method}</p>
        <p className="panel-sub muted">
          <strong>Proxy, not an operational product.</strong> Derived from a
          5-level temperature profile; INCOIS issues the official bulletins.
        </p>
      </footer>
    </aside>
  );
}
