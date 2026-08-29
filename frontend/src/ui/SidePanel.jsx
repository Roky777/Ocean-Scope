import { useEffect, useRef, useState } from "react";
import { COLORMAP_NAMES, gradient } from "../colormaps";
import DepthSlider from "./DepthSlider";
import { useClosable } from "./useClosable";

const TABS = [
  { id: "variable", label: "Data layer", hint: "Choose the ocean variable to display" },
  { id: "depth", label: "Depth", hint: "Choose a water depth" },
  { id: "time", label: "Time & forecast", hint: "Animate analyses and explore forecast lead times" },
  { id: "colorbar", label: "Colour scale", hint: "Adjust palette, range and value distribution" },
  { id: "layers", label: "3D display", hint: "Change the 3D rendering style" },
  { id: "instruments", label: "Instruments", hint: "Show or hide observation platforms" },
];

function ToolIcon({ name }) {
  const paths = {
    variable: <><circle cx="8" cy="8" r="4"/><circle cx="16" cy="16" r="4"/><path d="M11 11l2 2"/></>,
    depth: <><path d="M5 6h14M7 12h10M9 18h6"/><path d="M3 3v18"/></>,
    time: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    colorbar: <><path d="M4 7h16v10H4z"/><path d="M8 7v10M12 7v10M16 7v10"/></>,
    layers: <><path d="M12 3L3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5M3 17l9 5 9-5"/></>,
    instruments: <><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="8"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

/**
 * Right-edge control dock. Collapsed to a slim labelled tab strip by default
 * so the scene is not crowded on load; clicking a tab expands its panel.
 */
export default function SidePanel({
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
  volumeTransfer,
  onVolumeTransfer,
  forecastEnabled,
  onForecastEnabled,
  forecastLead,
  onForecastLead,
  instruments,
  instrumentTypes,
  onInstrumentTypes,
  onInstrumentUpload,
  onDatasetUpload,
}) {
  // `view` lags `open` by one animation so closing can animate out.
  const [view, closing] = useClosable(open);
  const dockRef = useRef(null);
  const stripRef = useRef(null);
  const dragRef = useRef(null);
  const [dockPosition, setDockPosition] = useState(() => ({
    x: 18,
    y: typeof window === "undefined" ? 100 : Math.max(82, Math.round((window.innerHeight - 450) / 2)),
  }));

  const beginDockDrag = (event) => {
    if (window.innerWidth <= 700) return;
    event.preventDefault();
    const rect = stripRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDock = (event) => {
    if (!dragRef.current || window.innerWidth <= 700) return;
    const rect = stripRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 112;
    const height = rect?.height ?? 440;
    setDockPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragRef.current.dx)),
      y: Math.max(76, Math.min(window.innerHeight - height - 8, event.clientY - dragRef.current.dy)),
    });
  };

  const endDockDrag = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const desktop = typeof window !== "undefined" && window.innerWidth > 700;
  const stripStyle = desktop ? { left: dockPosition.x, top: dockPosition.y, right: "auto", transform: "none" } : undefined;
  const panelWidth = 340;
  const openRight = !desktop || dockPosition.x + 124 + panelWidth < window.innerWidth - 12;
  const panelStyle = desktop ? {
    left: openRight ? dockPosition.x + 124 : Math.max(12, dockPosition.x - panelWidth - 12),
    right: "auto",
  } : undefined;

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
      <nav className="tab-strip" aria-label="Controls" ref={stripRef} style={stripStyle}>
        <button
          className="dock-grip"
          type="button"
          aria-label="Move control toolbar"
          title="Drag to move toolbar"
          onPointerDown={beginDockDrag}
          onPointerMove={moveDock}
          onPointerUp={endDockDrag}
          onPointerCancel={endDockDrag}
        ><span/><span/><span/></button>
        {TABS.map((t) => (
          <button
            key={t.id}
            data-tour={t.id}
            className={open === t.id ? "tab active" : "tab"}
            onClick={() => onToggle(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
            title={t.hint}
          >
            <span className="tab-glyph"><ToolIcon name={t.id} /></span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {view && (
        <section className={closing ? "panel closing" : "panel open"} style={panelStyle}>
          <header className="panel-head">
            <h2>{TABS.find((t) => t.id === view)?.label}</h2>
            <button className="panel-close" onClick={() => onToggle(null)} aria-label="Collapse">
              ›
            </button>
          </header>

          {view === "variable" && (
            <div className="panel-body">
              <p className="hint">What would you like to see?</p>
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
                  ? "Review the monthly analysis or enable the experimental forecast model."
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
                <span><strong>Forecast model</strong><small>Project 1–3 months beyond the latest analysis</small></span>
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
                  <p className="forecast-note">Experimental statistical projection. Clearly marked as predicted and not an official operational INCOIS forecast.</p>
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
              <p className="hint">Choose a simple way to look at the water.</p>
              <p className="field-label">Ocean view</p>
              <div className="segmented render-mode-control">
                <button className={renderMode === "surface" ? "seg active" : "seg"} onClick={() => onRenderMode("surface")}>Ocean surface</button>
                <button className={renderMode === "slice" ? "seg active" : "seg"} disabled={!volumeAvailable} onClick={() => onRenderMode("slice")}>Depth sheet</button>
                <button className={renderMode === "volume" ? "seg active" : "seg"} disabled={!volumeAvailable} onClick={() => onRenderMode("volume")}>See inside</button>
              </div>

              {renderMode === "volume" && volumeAvailable && (
                <div className="transfer-editor">
                  <div className="transfer-title"><span><strong>Volume transfer function</strong><small>Value → colour and opacity</small></span><button className="link-button" onClick={() => onVolumeTransfer({ density: 1, low: 0, high: 1, clipNear: 0, clipDeep: 1, quality: 96 })}>Reset</button></div>
                  <div className="transfer-preview" style={{ background: `linear-gradient(to right, ${gradient(palette)})` }}><i style={{ left: `${volumeTransfer.low * 100}%`, right: `${(1 - volumeTransfer.high) * 100}%` }} /></div>
                  <div className="transfer-presets"><button onClick={() => onVolumeTransfer({ low: 0.65, high: 1, density: 1.4 })}>Warm water</button><button onClick={() => onVolumeTransfer({ low: 0.35, high: 0.68, density: 1.2 })}>Middle</button><button onClick={() => onVolumeTransfer({ low: 0, high: 0.38, density: 1.4 })}>Cool water</button></div>
                  <details className="scientist-controls"><summary>More controls</summary><div>
                  <label className="range-control compact"><span>Density <strong>{volumeTransfer.density.toFixed(1)}×</strong></span><input type="range" min="0.2" max="2.5" step="0.1" value={volumeTransfer.density} onChange={(e) => onVolumeTransfer({ density: Number(e.target.value) })}/></label>
                  <div className="dual-readout"><span>Visible values</span><strong>{Math.round(volumeTransfer.low * 100)}–{Math.round(volumeTransfer.high * 100)}%</strong></div>
                  <label className="range-control compact"><span>Lower threshold</span><input type="range" min="0" max={Math.max(0, volumeTransfer.high - 0.05)} step="0.01" value={volumeTransfer.low} onChange={(e) => onVolumeTransfer({ low: Number(e.target.value) })}/></label>
                  <label className="range-control compact"><span>Upper threshold</span><input type="range" min={Math.min(1, volumeTransfer.low + 0.05)} max="1" step="0.01" value={volumeTransfer.high} onChange={(e) => onVolumeTransfer({ high: Number(e.target.value) })}/></label>
                  <div className="dual-readout"><span>Depth clipping</span><strong>{Math.round(volumeTransfer.clipNear * 100)}–{Math.round(volumeTransfer.clipDeep * 100)}%</strong></div>
                  <label className="range-control compact"><span>Shallow boundary</span><input type="range" min="0" max={Math.max(0, volumeTransfer.clipDeep - 0.05)} step="0.01" value={volumeTransfer.clipNear} onChange={(e) => onVolumeTransfer({ clipNear: Number(e.target.value) })}/></label>
                  <label className="range-control compact"><span>Deep boundary</span><input type="range" min={Math.min(1, volumeTransfer.clipNear + 0.05)} max="1" step="0.01" value={volumeTransfer.clipDeep} onChange={(e) => onVolumeTransfer({ clipDeep: Number(e.target.value) })}/></label>
                  <p className="field-label">Interaction quality</p><div className="segmented">{[[64,"Fast"],[96,"Balanced"],[160,"Fine"]].map(([value,label])=><button key={value} className={volumeTransfer.quality === value ? "seg active" : "seg"} onClick={() => onVolumeTransfer({ quality: value })}>{label}</button>)}</div>
                  </div></details>
                </div>
              )}

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

          {view === "instruments" && (
            <div className="panel-body">
              <p className="hint">Turn ocean robots on or off. Tap a marker to see what it measured.</p>
              <div className="instrument-filters">
                {["argo", "glider", "ctd", "bgc"].map((kind) => {
                  const count = instruments.filter((item) => (item.type ?? "argo") === kind).length;
                  const checked = instrumentTypes.includes(kind);
                  return (
                    <label className="toggle-row" key={kind}>
                      <span><strong>{{ argo: "Floating robots", glider: "Gliders", ctd: "Ship sensors", bgc: "Science floats" }[kind]}</strong><small>{count} on the map</small></span>
                      <input type="checkbox" checked={checked} onChange={() => onInstrumentTypes(checked ? instrumentTypes.filter((x) => x !== kind) : [...instrumentTypes, kind])} />
                    </label>
                  );
                })}
              </div>
              <div className="control-divider" />
              <label className="field-label" htmlFor="instrument-type">Import CSV/ASCII profiles</label>
              <select id="instrument-type" className="select-native" defaultValue="glider">
                <option value="glider">Glider</option><option value="ctd">CTD</option><option value="bgc">BGC</option><option value="argo">Argo</option>
              </select>
              <input className="file-input" type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const type = document.getElementById("instrument-type")?.value ?? "glider";
                try { await onInstrumentUpload(file, type); event.target.value = ""; }
                catch (error) { window.alert(error.message); }
              }} />
              <p className="hint small">Required columns: latitude, longitude and depth. Optional aliases include temp, psal, chla, timestamp and platform_id.</p>
              <div className="control-divider" />
              <label className="field-label">Register CF-NetCDF dataset</label>
              <input className="file-input" type="file" accept=".nc,.netcdf,application/x-netcdf" onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try { await onDatasetUpload(file); event.target.value = ""; }
                catch (error) { window.alert(error.message); }
              }} />
              <p className="hint small">Validated uploads are registered safely and do not replace the active operational dataset.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
