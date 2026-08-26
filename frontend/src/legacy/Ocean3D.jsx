import { useEffect, useState } from "react";
import OceanScene from "./OceanScene";
import { fetchSlice, fetchFloats } from "../api";
import { colormapCSS } from "./colormap";

const TIMESTEP = 0; // time animation is out of scope for this prototype

export default function Ocean3D({ onSwitch }) {
  const [slice, setSlice] = useState(null);
  const [depths, setDepths] = useState([]);
  const [depthIndex, setDepthIndex] = useState(0);
  const [floats, setFloats] = useState([]);
  const [floatSource, setFloatSource] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Floats load once.
  useEffect(() => {
    fetchFloats()
      .then((d) => {
        setFloats(d.floats);
        setFloatSource(d.source);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Slice reloads whenever the depth changes. The first request (depths still
  // empty) asks for 0 m and also tells us which depth levels exist.
  useEffect(() => {
    const depth = depths[depthIndex] ?? 0;
    if (slice && slice.depth === depth) return; // already showing this level

    let cancelled = false;
    setLoading(true);
    fetchSlice(depth, TIMESTEP)
      .then((d) => {
        if (cancelled) return;
        setSlice(d);
        setDepths((prev) => (prev.length ? prev : d.depths_available));
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [depthIndex, depths, slice]);

  const range = slice?.global_range;

  return (
    <div className="app">
      <OceanScene
        slice={slice}
        floats={floats}
        selectedId={selected?.id}
        onSelect={setSelected}
      />

      <header className="panel header">
        <h1>OceanScope</h1>
        <p className="sub">Bay of Bengal · temperature · prototype</p>
        <button className="switch dark" onClick={onSwitch}>
          ← 2D reference
        </button>
      </header>

      <div className="panel controls">
        <label htmlFor="depth">
          Depth <strong>{slice ? `${slice.depth} m` : "—"}</strong>
        </label>
        <input
          id="depth"
          type="range"
          min={0}
          max={Math.max(0, depths.length - 1)}
          step={1}
          value={depthIndex}
          disabled={depths.length === 0}
          onChange={(e) => setDepthIndex(Number(e.target.value))}
        />
        <div className="ticks">
          {depths.map((d, i) => (
            <button
              key={d}
              className={i === depthIndex ? "tick active" : "tick"}
              onClick={() => setDepthIndex(i)}
            >
              {d}m
            </button>
          ))}
        </div>

        {range && (
          <div className="legend">
            <div
              className="bar"
              style={{
                background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.7, 0.87, 1]
                  .map((t) => colormapCSS(t))
                  .join(", ")})`,
              }}
            />
            <div className="legend-labels">
              <span>{range.min}°C</span>
              <span>{range.max}°C</span>
            </div>
          </div>
        )}

        {slice && (
          <p className="meta">
            {slice.shape[0]}×{slice.shape[1]} grid · this slice{" "}
            {slice.slice_range.min}–{slice.slice_range.max}°C · {slice.time.slice(0, 10)}
            {loading && " · loading…"}
          </p>
        )}
        <p className="meta dim">
          {floats.length} Argo floats · {floatSource}
        </p>
      </div>

      {selected && (
        <div className="panel popup">
          <button className="close" onClick={() => setSelected(null)}>
            ×
          </button>
          <h2>{selected.id}</h2>
          <p className="big">{selected.temperature.toFixed(2)} °C</p>
          <dl>
            <dt>Latitude</dt>
            <dd>{selected.lat.toFixed(3)}° N</dd>
            <dt>Longitude</dt>
            <dd>{selected.lon.toFixed(3)}° E</dd>
            <dt>Depth</dt>
            <dd>{selected.depth} m</dd>
            <dt>Observed</dt>
            <dd>{selected.time.slice(0, 10)}</dd>
            <dt>Data</dt>
            <dd>{selected.source === "real" ? "real Argo" : "placeholder"}</dd>
          </dl>
        </div>
      )}

      {error && <div className="panel error">⚠ {error}</div>}
    </div>
  );
}
