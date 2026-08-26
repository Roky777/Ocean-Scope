import { useCallback, useEffect, useRef, useState } from "react";
import Scene from "./scene/Scene";
import TopBar from "./ui/TopBar";
import SidePanel from "./ui/SidePanel";
import Colorbar from "./ui/Colorbar";
import FloatProfile from "./ui/FloatProfile";
import Toast from "./ui/Toast";
import Loading from "./ui/Loading";
import PointTooltip from "./ui/PointTooltip";
import PointProfile from "./ui/PointProfile";
import { useClosable } from "./ui/useClosable";
import {
  fetchMeta,
  fetchField,
  fetchFloats,
  fetchLand,
  prefetchTimesteps,
  prefetchDepths,
} from "./api";
import "./App.css";

const PLAY_INTERVAL_MS = 1500; // spec: 1-2 s per timestep

export default function App() {
  const [meta, setMeta] = useState(null);
  const [field, setField] = useState(null);
  const [land, setLand] = useState(null);
  const [floats, setFloats] = useState([]);

  const [variable, setVariable] = useState("temperature");
  const [depth, setDepth] = useState(0);
  const [timestep, setTimestep] = useState(0);

  const [openTab, setOpenTab] = useState(null); // collapsed on load, per spec
  const [selectedFloat, setSelectedFloat] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [pickedPoint, setPickedPoint] = useState(null);

  // Detail panels linger for one animation frame-set so they can slide out.
  const [shownFloat, floatClosing] = useClosable(selectedFloat);
  const [shownPoint, pointClosing] = useClosable(pickedPoint);
  // Default to the CURRENT SLICE's own min/max, so the loaded month always
  // uses the full colour gradient. Scaling to the whole depth (all 12 months)
  // squeezes any single month into a fraction of the ramp and makes the
  // terrain look uniformly one colour.
  const [scaleMode, setScaleMode] = useState("slice");
  const [playing, setPlaying] = useState(false);

  const [booting, setBooting] = useState(true);
  const [fetching, setFetching] = useState(false); // shown only if slow (>300ms)
  const [resetSignal, setResetSignal] = useState(0);
  const [toasts, setToasts] = useState([]);

  const toastId = useRef(0);
  const pushToast = useCallback((text) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  // --- initial load ------------------------------------------------------
  useEffect(() => {
    let alive = true;

    fetchLand()
      .then((l) => alive && setLand(l))
      .catch((e) => alive && pushToast(`Coastlines unavailable: ${e.message}`));

    fetchFloats()
      .then((d) => alive && setFloats(d.floats))
      .catch((e) => alive && pushToast(`Argo floats unavailable: ${e.message}`));

    fetchMeta()
      .then((m) => {
        if (!alive) return;
        setMeta(m);
        setVariable(m.default_variable);
        setDepth(m.depths[0]);
        setTimestep(m.default_timestep); // most recent available step
      })
      .catch((e) => {
        if (!alive) return;
        pushToast(`Cannot reach the API: ${e.message}`);
        setBooting(false);
      });

    return () => {
      alive = false;
    };
  }, [pushToast]);

  // --- slice fetching ----------------------------------------------------
  useEffect(() => {
    if (!meta) return;
    let alive = true;

    // Only surface a spinner if the fetch is actually slow. Cached slices
    // resolve instantly and must not flash an indicator.
    const slow = setTimeout(() => alive && setFetching(true), 300);

    fetchField(variable, depth, timestep)
      .then((d) => {
        if (!alive) return;
        if (d.empty) {
          pushToast("No data available at this depth for this timestep");
          return; // keep the previous terrain rather than blanking the scene
        }
        setField(d);
      })
      .catch((e) => {
        if (!alive) return;
        pushToast(e.message || "No data available at this depth for this timestep");
        setPlaying(false);
      })
      .finally(() => {
        clearTimeout(slow);
        if (alive) setFetching(false);
      });

    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [meta, variable, depth, timestep, pushToast]);

  // Warm the cache so playback does not stutter on first pass.
  useEffect(() => {
    if (!meta) return;
    prefetchTimesteps(variable, depth, meta.timesteps.length);
  }, [meta, variable, depth]);

  // Warm every depth at this timestep so clicking a point can build its full
  // depth profile synchronously, with no fetch at click time.
  useEffect(() => {
    if (!meta) return;
    prefetchDepths(variable, meta.depths, timestep);
  }, [meta, variable, timestep]);

  // --- time playback -----------------------------------------------------
  useEffect(() => {
    if (!playing || !meta) return;
    const id = setInterval(() => {
      setTimestep((t) => (t + 1) % meta.timesteps.length);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [playing, meta]);

  // --- derived -----------------------------------------------------------
  const activeVar = meta?.variables.find((v) => v.id === variable);
  const ranges = meta?.ranges?.[variable];
  const range =
    scaleMode === "global"
      ? ranges?.global
      : scaleMode === "depth"
        ? ranges?.by_depth?.[String(depth)] ?? field?.range
        : field?.range;

  const ready = Boolean(meta && field && range && range.min != null);

  const handleVariable = (id) => {
    setVariable(id);
    setSelectedFloat(null);
  };

  const handleSelectFloat = (f) => {
    setPickedPoint(null); // only one detail panel at a time
    setSelectedFloat(f);
  };

  const handlePickPoint = (p) => {
    setSelectedFloat(null);
    setPickedPoint(p);
  };

  return (
    <div className="app">
      {ready && (
        <Scene
          resetSignal={resetSignal}
          field={field}
          range={range}
          colormap={field.colormap}
          land={land}
          floats={floats}
          selectedId={selectedFloat?.id}
          onSelectFloat={handleSelectFloat}
          onHoverPoint={setHoverPoint}
          onPickPoint={handlePickPoint}
          onTerrainReady={() => setBooting(false)}
        />
      )}

      <Loading show={booting} text={meta ? "Rendering ocean surface…" : "Loading ocean data…"} />

      {meta && (
        <TopBar variables={meta.variables} active={variable} onChange={handleVariable} />
      )}

      {meta && (
        <SidePanel
          open={openTab}
          onToggle={setOpenTab}
          variables={meta.variables}
          variable={variable}
          onVariable={handleVariable}
          depths={meta.depths}
          depth={depth}
          onDepth={setDepth}
          timesteps={meta.timesteps}
          timestep={timestep}
          fetching={fetching}
          onTimestep={(t) => {
            setPlaying(false);
            setTimestep(t);
          }}
          playing={playing}
          onPlayToggle={() => setPlaying((p) => !p)}
          colormap={field?.colormap ?? "thermal"}
          range={range}
          scaleMode={scaleMode}
          onScaleMode={setScaleMode}
          units={activeVar?.units ?? ""}
        />
      )}

      {ready && (
        <Colorbar
          label={field.label}
          units={field.units}
          colormap={field.colormap}
          range={range}
          context={`${field.month_label} · ${field.depth} m${
            scaleMode === "slice" ? "" : ` · scale: ${scaleMode === "global" ? "all depths" : "this depth"}`
          }`}
        />
      )}

      {ready && !pickedPoint && !selectedFloat && (
        <PointTooltip point={hoverPoint} label={field.label} units={field.units} />
      )}

      {shownFloat && (
        <FloatProfile
          float={shownFloat}
          closing={floatClosing}
          variable={variable}
          label={field.label}
          units={field.units}
          timestep={timestep}
          depths={meta.depths}
          monthLabel={field.month_label}
          onClose={() => setSelectedFloat(null)}
        />
      )}

      {ready && shownPoint && (
        <PointProfile
          point={shownPoint}
          closing={pointClosing}
          variable={variable}
          units={field.units}
          label={field.label}
          timestep={timestep}
          monthLabel={field.month_label}
          depths={meta.depths}
          floats={floats}
          onClose={() => setPickedPoint(null)}
        />
      )}

      {meta && (
        <div className="source-label" title={meta.source}>
          <span className="source-dot" aria-hidden="true" />
          Source: {meta.source_label}
          {field && <em> · {field.shape[0]}×{field.shape[1]} native grid</em>}
        </div>
      )}

      <button
        className="reset-view-btn"
        onClick={() => setResetSignal((n) => n + 1)}
        title="Return the camera to the default 3/4 view"
      >
        <span aria-hidden="true">⌂</span> Reset view
      </button>

      {fetching && (
        <div className="fetch-chip" role="status">
          <span className="mini-spinner" /> Updating…
        </div>
      )}

      <Toast messages={toasts} onDismiss={dismissToast} />
    </div>
  );
}
