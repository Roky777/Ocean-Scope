import { gradient } from "../colormaps";
import { useClosable } from "./useClosable";

const TABS = [
  { id: "variable", label: "Variable", glyph: "◈",
    hint: "Choose which measured field colours the surface" },
  { id: "depth", label: "Depth", glyph: "≡",
    hint: "Move between depth levels, from the surface down to 500 m" },
  { id: "time", label: "Time", glyph: "◷",
    hint: "Step or animate through the monthly timesteps" },
  { id: "colorbar", label: "Colorbar", glyph: "▤",
    hint: "Inspect and rescale the value-to-colour mapping" },
];

/**
 * Right-edge control dock. Collapsed to a slim labelled tab strip by default
 * so the scene is not crowded on load; clicking a tab expands its panel.
 */
export default function SidePanel({
  mode,
  open,
  onToggle,
  variables,
  variable,
  onVariable,
  depths,
  depth,
  onDepth,
  timesteps,
  timestep,
  onTimestep,
  playing,
  onPlayToggle,
  fetching,
  colormap,
  range,
  scaleMode,
  onScaleMode,
  units,
}) {
  // `view` lags `open` by one animation so closing can animate out.
  const [view, closing] = useClosable(open);

  return (
    <div className={open ? "dock open" : "dock"}>
      <nav className="tab-strip" aria-label="Controls">
        {/* Explore mode is for outreach: the colour-scale controls are an
            expert affordance and only add noise there. */}
        {TABS.filter((t) => mode !== "explore" || t.id !== "colorbar").map((t) => (
          <button
            key={t.id}
            className={open === t.id ? "tab active" : "tab"}
            onClick={() => onToggle(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
            title={t.hint}
          >
            <span className="tab-glyph" aria-hidden="true">{t.glyph}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {view && (
        <section className={closing ? "panel closing" : "panel open"}>
          <header className="panel-head">
            <h2>{TABS.find((t) => t.id === view)?.label}</h2>
            <button className="panel-close" onClick={() => onToggle(null)} aria-label="Collapse">
              ›
            </button>
          </header>

          {view === "variable" && (
            <div className="panel-body">
              <p className="hint">Choose the field painted onto the surface.</p>
              <div className="radio-list">
                {variables.map((v) => (
                  <button
                    key={v.id}
                    className={v.id === variable ? "radio active" : "radio"}
                    disabled={!v.available}
                    title={v.available ? undefined : v.note || "Coming soon"}
                    onClick={() => v.available && onVariable(v.id)}
                  >
                    <span className="radio-dot" aria-hidden="true" />
                    <span className="radio-text">
                      {v.label}
                      <em>{v.units}</em>
                    </span>
                    {!v.available && <span className="soon">Coming soon</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "depth" && (
            <div className="panel-body">
              <p className="hint">Surface at the top, deepest at the bottom.</p>
              <div className="depth-control">
                <input
                  className="depth-slider"
                  type="range"
                  min={0}
                  max={depths.length - 1}
                  step={1}
                  value={depths.indexOf(depth)}
                  onChange={(e) => onDepth(depths[Number(e.target.value)])}
                  aria-label="Depth level"
                />
                <ul className="depth-scale">
                  {depths.map((d) => (
                    <li key={d}>
                      <button
                        className={d === depth ? "depth-step active" : "depth-step"}
                        onClick={() => onDepth(d)}
                      >
                        {d} m
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {view === "time" && (
            <div className="panel-body">
              <p className="hint">
                {timesteps.length > 1
                  ? "Monthly INCOIS analysis — press play to run through the sequence."
                  : "This dataset has a single timestep, so there is nothing to animate."}
              </p>
              <div className="time-row">
                <button
                  className="play"
                  onClick={onPlayToggle}
                  disabled={timesteps.length < 2}
                  title={
                    timesteps.length < 2
                      ? "Only one timestep is available in this dataset"
                      : playing
                        ? "Pause playback"
                        : "Play through the timesteps"
                  }
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? "❚❚" : "▶"}
                  <span>{playing ? "Pause" : "Play"}</span>
                </button>
                <span className="time-current">
                  {timesteps[timestep]?.label}
                  {fetching && <em className="loading-dot"> · loading</em>}
                </span>
              </div>
              <input
                className="time-scrubber"
                type="range"
                min={0}
                max={Math.max(0, timesteps.length - 1)}
                step={1}
                value={timestep}
                disabled={timesteps.length < 2}
                onChange={(e) => onTimestep(Number(e.target.value))}
                aria-label="Timestep"
              />
              <div className="time-ticks">
                {timesteps.map((t) => (
                  <button
                    key={t.index}
                    className={t.index === timestep ? "time-tick active" : "time-tick"}
                    onClick={() => onTimestep(t.index)}
                    title={t.label}
                  >
                    {t.label.slice(0, 1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "colorbar" && (
            <div className="panel-body">
              <p className="hint">How values map to colour on the surface.</p>
              <div
                className="swatch"
                style={{ background: `linear-gradient(to right, ${gradient(colormap)})` }}
              />
              <dl className="readout">
                <dt>Minimum</dt>
                <dd>{range?.min ?? "—"} {units}</dd>
                <dt>Maximum</dt>
                <dd>{range?.max ?? "—"} {units}</dd>
                <dt>Colormap</dt>
                <dd>{colormap}</dd>
              </dl>
              <p className="hint">Scale range</p>
              <div className="segmented">
                <button
                  className={scaleMode === "slice" ? "seg active" : "seg"}
                  onClick={() => onScaleMode("slice")}
                  title="Min/max of the month and depth currently loaded"
                >
                  This slice
                </button>
                <button
                  className={scaleMode === "depth" ? "seg active" : "seg"}
                  onClick={() => onScaleMode("depth")}
                  title="Min/max across every month at this depth"
                >
                  This depth
                </button>
                <button
                  className={scaleMode === "global" ? "seg active" : "seg"}
                  onClick={() => onScaleMode("global")}
                  title="Min/max across every depth and month"
                >
                  All
                </button>
              </div>
              <p className="hint small">
                “This slice” uses the full gradient on the loaded data. The wider
                scales keep colours comparable as you move through depth or time,
                at the cost of contrast.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
