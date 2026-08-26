import { useEffect, useRef } from "react";
import { COLORMAP_NAMES, gradient } from "../colormaps";
import DepthSlider from "./DepthSlider";
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
  { id: "layers", label: "Layers", glyph: "≋",
    hint: "Volume, currents, isosurface and layer blending" },
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
  surfaceOnly,
  variableLabel,
  scaleMode,
  onScaleMode,
  scaleType,
  onScaleType,
  palette,
  onPalette,
  manualRange,
  onManualRange,
  units,
  renderMode,
  onRenderMode,
  volumeAvailable,
  showCurrents,
  onShowCurrents,
  showIsosurface,
  onShowIsosurface,
  isoValue,
  onIsoValue,
  isoRange,
  verticalExaggeration,
  onVerticalExaggeration,
  layerOpacity,
  onLayerOpacity,
  forecastEnabled,
  onForecastEnabled,
  forecastLead,
  onForecastLead,
}) {
  // `view` lags `open` by one animation so closing can animate out.
  const [view, closing] = useClosable(open);
  const dockRef = useRef(null);

  // Dismiss on outside click or Escape. Pointerdown rather than click so the
  // panel closes on press, matching how native menus behave.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) onToggle(null);
    };
    const key = (e) => {
      if (e.key === "Escape") onToggle(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open, onToggle]);

  return (
    <div className={open ? "dock open" : "dock"} ref={dockRef}>
      <nav className="tab-strip" aria-label="Controls">
        {/* Explore mode is for outreach: the colour-scale controls are an
            expert affordance and only add noise there. */}
        {TABS.filter((t) => mode !== "explore" || !["colorbar", "layers"].includes(t.id)).map((t) => (
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
              {surfaceOnly ? (
                /* Say so plainly rather than showing a control that does
                   nothing: these products are surface measurements. */
                <p className="depth-na">
                  <strong>{variableLabel}</strong> is a surface measurement, so
                  there are no depth levels to move between. Switch to
                  Temperature or Salinity to explore the water column.
                </p>
              ) : (
                <>
                  <p className="hint">Surface at the top, deepest at the bottom.</p>
                  <DepthSlider depths={depths} depth={depth} onDepth={onDepth} />
                </>
              )}
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
              <div className="control-divider" />
              <label className="toggle-row">
                <span><strong>Forecast</strong><small>Extend 1–3 months beyond observations</small></span>
                <input type="checkbox" checked={forecastEnabled} onChange={(e) => onForecastEnabled(e.target.checked)} />
              </label>
              {forecastEnabled && (
                <>
                  <div className="segmented">
                    {[1, 2, 3].map((lead) => (
                      <button key={lead} className={forecastLead === lead ? "seg active" : "seg"} onClick={() => onForecastLead(lead)}>
                        +{lead} month{lead > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                  <p className="forecast-note">Predicted · baseline statistical projection, not an operational INCOIS forecast.</p>
                </>
              )}
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

              <p className="hint">Distribution</p>
              <div className="segmented">
                <button
                  className={scaleType === "linear" ? "seg active" : "seg"}
                  onClick={() => onScaleType("linear")}
                  title="Even steps in value"
                >
                  Linear
                </button>
                <button
                  className={scaleType === "log" ? "seg active" : "seg"}
                  onClick={() => onScaleType("log")}
                  title="Even steps in ratio — for values spanning orders of magnitude"
                >
                  Logarithmic
                </button>
              </div>

              <div className="stack">
                <label className="field-label" htmlFor="cb-palette">Palette</label>
                <select
                  id="cb-palette"
                  className="select-native"
                  value={palette}
                  onChange={(e) => onPalette(e.target.value)}
                >
                  {COLORMAP_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <div
                  className="swatch"
                  style={{ background: `linear-gradient(to right, ${gradient(palette)})` }}
                />
              </div>

              <div className="stack">
                <label className="field-label">Custom range</label>
                <div className="range-inputs">
                  <input
                    className="num-input"
                    type="number"
                    step="any"
                    placeholder={String(range?.min ?? "min")}
                    value={manualRange?.min ?? ""}
                    onChange={(e) =>
                      onManualRange({ ...manualRange, min: e.target.value })
                    }
                    aria-label="Colour scale minimum"
                  />
                  <span className="range-dash" aria-hidden="true">–</span>
                  <input
                    className="num-input"
                    type="number"
                    step="any"
                    placeholder={String(range?.max ?? "max")}
                    value={manualRange?.max ?? ""}
                    onChange={(e) =>
                      onManualRange({ ...manualRange, max: e.target.value })
                    }
                    aria-label="Colour scale maximum"
                  />
                  {manualRange && (
                    <button
                      className="link-button"
                      onClick={() => onManualRange(null)}
                      title="Return to the automatic range"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <p className="hint small">
                “This slice” uses the full gradient on the loaded data. The wider
                scales keep colours comparable as you move through depth or time,
                at the cost of contrast.
              </p>
            </div>
          )}

          {view === "layers" && (
            <div className="panel-body">
              <p className="hint">Scientific rendering layers share the same real grid.</p>
              <p className="field-label">Render mode</p>
              <div className="segmented render-mode-control">
                <button className={renderMode === "surface" ? "seg active" : "seg"} onClick={() => onRenderMode("surface")}>Terrain</button>
                <button className={renderMode === "volume" ? "seg active" : "seg"} disabled={!volumeAvailable} onClick={() => onRenderMode("volume")}>Ray-marched volume</button>
              </div>

              <label className="range-control">
                <span>Vertical exaggeration <strong>{verticalExaggeration}×</strong></span>
                <input type="range" min="1" max="12" step="1" value={verticalExaggeration} onChange={(e) => onVerticalExaggeration(Number(e.target.value))} />
              </label>

              <label className="toggle-row">
                <span><strong>Current vectors</strong><small>Animated real INCOIS U/V glyphs</small></span>
                <input type="checkbox" checked={showCurrents} onChange={(e) => onShowCurrents(e.target.checked)} />
              </label>
              <label className="toggle-row">
                <span><strong>Isosurface</strong><small>True marching-tetrahedra extraction</small></span>
                <input type="checkbox" checked={showIsosurface} disabled={!volumeAvailable} onChange={(e) => onShowIsosurface(e.target.checked)} />
              </label>
              {showIsosurface && volumeAvailable && (
                <div className="range-control">
                  <span>Target value <strong>{Number(isoValue).toFixed(1)} {units}</strong></span>
                  <input aria-label="Isosurface target value" type="range" min={isoRange?.min ?? 0} max={isoRange?.max ?? 1} step={(isoRange?.max - isoRange?.min) / 80 || 0.1} value={isoValue} onChange={(e) => onIsoValue(Number(e.target.value))} />
                  {variable === "temperature" && (
                    <div className="iso-presets" aria-label="Temperature isosurface presets">
                      {[20, 26, 28]
                        .filter((v) => v >= (isoRange?.min ?? 0) && v <= (isoRange?.max ?? 100))
                        .map((v) => (
                          <button key={v} className={Math.abs(isoValue - v) < 0.05 ? "preset active" : "preset"} onClick={() => onIsoValue(v)}>
                            {v} °C
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <p className="field-label">Layer opacity</p>
              {["surface", ...(renderMode === "volume" ? ["volume"] : []), ...(showCurrents ? ["currents"] : []), ...(showIsosurface ? ["isosurface"] : [])].map((name) => (
                <label className="range-control compact" key={name}>
                  <span>{name[0].toUpperCase() + name.slice(1)} <strong>{Math.round((layerOpacity[name] ?? 1) * 100)}%</strong></span>
                  <input type="range" min="0" max="1" step="0.05" value={layerOpacity[name] ?? 1} onChange={(e) => onLayerOpacity(name, Number(e.target.value))} />
                </label>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
