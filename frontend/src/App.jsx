import { useCallback, useEffect, useRef, useState } from "react";
import Scene from "./scene/Scene";
import AppNav from "./ui/AppNav";
import Splash from "./ui/Splash";
import HazardView from "./views/HazardView";
import AboutView from "./views/AboutView";
import SidePanel from "./ui/SidePanel";
import Colorbar from "./ui/Colorbar";
import FloatProfile from "./ui/FloatProfile";
import Toast from "./ui/Toast";
import Loading from "./ui/Loading";
import PointTooltip from "./ui/PointTooltip";
import EvidencePanel from "./ui/EvidencePanel";
import { WorkspaceDepth, WorkspaceTimeline } from "./ui/WorkspaceChrome";
import WelcomeGuide from "./ui/WelcomeGuide";
import ModePanel from "./ui/ModePanel";
import ContextPlaceholder from "./ui/ContextPlaceholder";
import SceneToolbar from "./ui/SceneToolbar";
import ScienceLab from "./ui/ScienceLab";
import { useClosable } from "./ui/useClosable";
import {
  fetchMeta,
  fetchField,
  fetchInstruments,
  uploadInstruments,
  uploadDataset,
  fetchLand,
  fetchHazard,
  fetchVolume,
  fetchCurrents,
  fetchIsosurface,
  fetchForecast,
  prefetchTimesteps,
  prefetchDepths,
} from "./api";
import "./App.css";

const FRIENDLY_VARIABLES = {
  temperature: "Ocean temperature",
  salinity: "Salinity",
  current_speed: "Ocean currents",
  chlorophyll: "Microscopic ocean plants",
};

const friendlyVariable = (id, fallback) =>
  FRIENDLY_VARIABLES[id] ?? fallback?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function App() {
  const neutralRelief = import.meta.env.DEV && new URLSearchParams(window.location.search).has("neutralRelief");
  const [guideOpen, setGuideOpen] = useState(false);
  const [meta, setMeta] = useState(null);
  const [field, setField] = useState(null);
  const [land, setLand] = useState(null);
  const [floats, setFloats] = useState([]);
  const [instrumentTypes, setInstrumentTypes] = useState(["argo", "glider", "ctd", "bgc"]);

  const [variable, setVariable] = useState("temperature");
  const [depth, setDepth] = useState(0);
  const [timestep, setTimestep] = useState(0);

  // Application shell state.
  const [view, setView] = useState("explorer");
  const [hazard, setHazard] = useState(null);
  const [hazardLoading, setHazardLoading] = useState(false);
  const [selectedAdvisory, setSelectedAdvisory] = useState(null);
  const [hazardMetric, setHazardMetric] = useState("tchp");
  const [splash, setSplash] = useState(false);
  const [scientificOpen, setScientificOpen] = useState(false);
  const [experienceMode, setExperienceMode] = useState("explore");
  const [sceneTool, setSceneTool] = useState("3d");

  const [openTab, setOpenTab] = useState("variable");
  const [selectedFloat, setSelectedFloat] = useState(null);
  const [hoverPoint, setHoverPoint] = useState(null);
  const [pickedPoint, setPickedPoint] = useState(null);
  const [evidenceCandidates, setEvidenceCandidates] = useState([]);
  const [evidenceSelection, setEvidenceSelection] = useState(null);

  // Detail panels linger for one animation frame-set so they can slide out.
  const [shownFloat, floatClosing] = useClosable(selectedFloat);
  const [shownPoint, pointClosing] = useClosable(pickedPoint);
  // Default to the CURRENT SLICE's own min/max, so the loaded month always
  // uses the full colour gradient. Scaling to the whole depth (all 12 months)
  // squeezes any single month into a fraction of the ramp and makes the
  // terrain look uniformly one colour.
  const [scaleMode, setScaleMode] = useState("slice");
  // Colour-scale overrides. null means "follow the variable's own default".
  const [scaleTypeOverride, setScaleTypeOverride] = useState(null);
  const [paletteOverride, setPaletteOverride] = useState(null);
  const [manualRange, setManualRange] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [playIntervalMs, setPlayIntervalMs] = useState(1500);
  const [renderMode, setRenderMode] = useState("volume");
  const [volume, setVolume] = useState(null);
  const [currents, setCurrents] = useState(null);
  const [isosurface, setIsosurface] = useState(null);
  const [showCurrents, setShowCurrents] = useState(false);
  const [showIsosurface, setShowIsosurface] = useState(false);
  const [isoValue, setIsoValue] = useState(28);
  const [verticalExaggeration, setVerticalExaggeration] = useState(5);
  const [waveMotion, setWaveMotion] = useState(true);
  const [showScientificMesh, setShowScientificMesh] = useState(false);
  const [layerOpacity, setLayerOpacity] = useState({ surface: 1, volume: 0.76, currents: 0.88, isosurface: 0.62 });
  const [volumeTransfer, setVolumeTransfer] = useState({ density: 1, low: 0, high: 1, clipNear: 0, clipDeep: 1, quality: 64 });
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [forecastLead, setForecastLead] = useState(1);
  const [forecast, setForecast] = useState(null);
  const [searchTarget, setSearchTarget] = useState(null);

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

    fetchInstruments()
      .then((d) => alive && setFloats(d.instruments))
      .catch((e) => alive && pushToast(`Instrument observations unavailable: ${e.message}`));

    fetchMeta()
      .then((m) => {
        if (!alive) return;
        setMeta({ ...m, variables: m.variables.map((item) => ({ ...item, label: friendlyVariable(item.id, item.label) })) });
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
        setField({ ...d, label: friendlyVariable(variable, d.label) });
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

  const volumeAvailable = Boolean(meta?.variables.find((v) => v.id === variable && !v.surface)?.available);

  useEffect(() => {
    if (!meta || (!showIsosurface && !["volume", "slice"].includes(renderMode)) || !volumeAvailable || forecastEnabled) return;
    let alive = true;
    fetchVolume(variable, timestep)
      .then((data) => alive && setVolume(data))
      .catch((e) => alive && pushToast(`Volume unavailable: ${e.message}`));
    return () => { alive = false; };
  }, [meta, variable, timestep, renderMode, showIsosurface, volumeAvailable, forecastEnabled, pushToast]);

  useEffect(() => {
    if (!showCurrents || !meta || forecastEnabled) return;
    let alive = true;
    fetchCurrents(timestep)
      .then((data) => alive && setCurrents(data))
      .catch((e) => alive && pushToast(`Current vectors unavailable: ${e.message}`));
    return () => { alive = false; };
  }, [showCurrents, meta, timestep, forecastEnabled, pushToast]);

  useEffect(() => {
    if (!showIsosurface || !volumeAvailable || forecastEnabled) {
      setIsosurface(null);
      return;
    }
    let alive = true;
    const id = setTimeout(() => {
      fetchIsosurface(variable, timestep, isoValue)
        .then((data) => {
          if (!alive) return;
          setIsosurface(data);
          if (!data.triangle_count) pushToast(`No ${isoValue.toFixed(1)} isosurface in this volume`);
        })
        .catch((e) => alive && pushToast(`Isosurface unavailable: ${e.message}`));
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [showIsosurface, volumeAvailable, forecastEnabled, variable, timestep, isoValue, pushToast]);

  useEffect(() => {
    if (!forecastEnabled) return;
    let alive = true;
    fetchForecast(forecastLead)
      .then((data) => alive && setForecast(data))
      .catch((e) => alive && pushToast(`Forecast unavailable: ${e.message}`));
    return () => { alive = false; };
  }, [forecastEnabled, forecastLead, pushToast]);

  // --- time playback -----------------------------------------------------
  useEffect(() => {
    if (!playing || !meta) return;
    const id = setInterval(() => {
      setTimestep((t) => (t + 1) % meta.timesteps.length);
    }, playIntervalMs);
    return () => clearInterval(id);
  }, [playing, meta, playIntervalMs]);

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

  // The Hazard section reuses the whole 3D scene, just fed a different grid.
  // Keeping one Canvas mounted means switching sections re-colours the terrain
  // through the existing eased transition instead of tearing the scene down.
  // Each variable carries its own sensible default (chlorophyll is log), which
  // the user can override per variable.
  const scaleType = scaleTypeOverride ?? field?.scale ?? "linear";
  const palette = paletteOverride ?? field?.colormap ?? "thermal";

  const manualApplied =
    manualRange &&
    manualRange.min !== "" && manualRange.max !== "" &&
    Number.isFinite(Number(manualRange.min)) &&
    Number.isFinite(Number(manualRange.max)) &&
    Number(manualRange.max) > Number(manualRange.min)
      ? { min: Number(manualRange.min), max: Number(manualRange.max) }
      : null;

  const hazardField = hazardMetric === "anomaly" ? hazard?.anomaly_field : hazard;
  const showingHazard = view === "hazard" && hazardField;
  const showingForecast = view === "explorer" && forecastEnabled && forecast;
  const sceneField = showingHazard ? hazardField : showingForecast ? forecast : field;
  const sceneRange = showingHazard ? hazardField.range : showingForecast ? forecast.range : manualApplied ?? range;
  const sceneColormap = showingHazard ? hazardField.colormap : palette;
  const sceneScaleType = showingHazard ? "linear" : scaleType;

  const handleVariable = (id) => {
    setVariable(id);
    setSelectedFloat(null);
    setPickedPoint(null);
    setEvidenceCandidates([]);
    setEvidenceSelection(null);
    setScaleTypeOverride(null);
    setPaletteOverride(null);
    setManualRange(null);
    setForecastEnabled(false);
    setVolume(null);
    setIsosurface(null);
    const spec = meta?.variables.find((v) => v.id === id);
    const vr = meta?.ranges?.[id]?.global;
    if (vr?.min != null) setIsoValue((vr.min + vr.max) / 2);
    if (spec?.surface) {
      setRenderMode("surface");
      setShowIsosurface(false);
    }
  };

  // Hazard grid follows the active timestep, and is only fetched when the
  // section is actually visited.
  useEffect(() => {
    if (view !== "hazard") return;
    let cancelled = false;
    setHazardLoading(true);
    fetchHazard(timestep)
      .then((h) => !cancelled && setHazard(h))
      .catch((e) => !cancelled && pushToast(`Hazard assessment unavailable: ${e.message}`))
      .finally(() => !cancelled && setHazardLoading(false));
    return () => {
      cancelled = true;
    };
  }, [view, timestep, pushToast]);

  // Advisory count for the nav badge: fetched once so the badge is meaningful
  // before the user ever opens the section.
  useEffect(() => {
    if (!meta) return;
    fetchHazard(timestep).then(setHazard).catch(() => {});
  }, [meta, timestep]);

  // Hold the splash until the scene is genuinely ready, then fade it out.
  useEffect(() => {
    if (booting) return;
    const t = setTimeout(() => setSplash(false), 1250);
    return () => clearTimeout(t);
  }, [booting]);

  const handleSelectFloat = (f) => {
    if (!f) {
      setSelectedFloat(null);
      return;
    }
    if (pickedPoint && f && evidenceCandidates.some((candidate) => candidate.id === f.id)) {
      pushToast("Use Compare in the evidence panel to collocate this observation");
      return;
    }
    setOpenTab(null);
    setPickedPoint(null); // only one detail panel at a time
    setEvidenceCandidates([]);
    setEvidenceSelection(null);
    setSelectedFloat(f);
  };

  const handlePickPoint = (p) => {
    // If a dock panel is open, the first click on the scene only dismisses it.
    // Otherwise dismissing a panel would also drop a point-inspection panel in
    // its place, which feels like the app fighting you.
    if (openTab && scientificOpen && window.innerWidth <= 1100) {
      setOpenTab(null);
    }
    setSelectedFloat(null);
    setPlaying(false);
    setEvidenceCandidates([]);
    setEvidenceSelection(null);
    setPickedPoint({ ...p, depth });
  };

  const handleMode = (mode) => {
    setExperienceMode(mode);
    setView("explorer");
    setPlaying(false);
    if (mode === "explore") { setScientificOpen(false); setOpenTab("variable"); }
    if (mode === "understand" || mode === "learn") { setScientificOpen(false); setOpenTab(null); }
    if (mode === "verify") { setScientificOpen(false); setOpenTab("instruments"); }
    if (mode === "analyze") { setScientificOpen(true); setOpenTab("layers"); }
  };

  const handleStory = (story) => {
    setView("explorer");
    setScientificOpen(false);
    if (story === "depth") { if (variable !== "temperature") handleVariable("temperature"); setDepth(meta.depths[Math.min(2, meta.depths.length - 1)]); setOpenTab("depth"); setExperienceMode("explore"); }
    if (story === "argo") { if (variable !== "temperature") handleVariable("temperature"); setInstrumentTypes(["argo"]); setOpenTab("instruments"); setExperienceMode("verify"); }
    if (story === "model") { if (variable !== "temperature") handleVariable("temperature"); setInstrumentTypes(["argo"]); setOpenTab("instruments"); setExperienceMode("verify"); pushToast("Select ocean water, then choose Check with Real Measurements"); }
  };

  const handleSceneTool = (tool) => {
    setSceneTool(tool);
    if (tool === "2d") { setRenderMode("surface"); setShowIsosurface(false); }
    if (tool === "3d") { setRenderMode("volume"); setShowIsosurface(false); }
    if (tool === "slice") { setRenderMode("slice"); setShowIsosurface(false); }
    if (tool === "isosurface") { setRenderMode("isosurface"); setShowIsosurface(true); }
    if (tool === "measure") { setOpenTab(null); pushToast("Select a point in the ocean to measure its value and depth"); }
  };

  const moveToNearestValidPoint = () => {
    if (!field || !pickedPoint) return;
    let nearest = null;
    for (let row = 0; row < field.values.length; row++) for (let column = 0; column < field.values[row].length; column++) {
      const value = field.values[row][column];
      if (value == null || !Number.isFinite(value)) continue;
      const lat = field.lat[row];
      const lon = field.lon[column];
      const distance = Math.pow(lat - pickedPoint.lat, 2) + Math.pow((lon - pickedPoint.lon) * Math.cos(pickedPoint.lat * Math.PI / 180), 2);
      if (!nearest || distance < nearest.distance) nearest = { lat, lon, value, distance };
    }
    if (nearest) setPickedPoint({ lat: nearest.lat, lon: nearest.lon, value: nearest.value, depth });
  };

  return (
    <div id="ocean-workspace" className={`app simple-shell view-${view}${scientificOpen ? " scientific-mode" : ""}`}>
      {ready && view !== "about" && (
        <Scene
          resetSignal={resetSignal}
          field={sceneField}
          range={sceneRange}
          colormap={sceneColormap}
          scaleType={sceneScaleType}
          land={land}
          floats={view === "hazard" ? [] : floats.filter((f) => instrumentTypes.includes(f.type ?? "argo"))}
          highlight={view === "hazard" ? selectedAdvisory : null}
          selectedId={evidenceSelection?.id ?? selectedFloat?.id}
          onSelectFloat={handleSelectFloat}
          onHoverPoint={setHoverPoint}
          onPickPoint={handlePickPoint}
          onTerrainReady={() => setBooting(false)}
          renderMode={renderMode}
          volume={view === "explorer" && !forecastEnabled ? volume : null}
          currents={view === "explorer" && showCurrents && !forecastEnabled ? currents : null}
          isosurface={view === "explorer" && showIsosurface && !forecastEnabled ? isosurface : null}
          verticalExaggeration={verticalExaggeration}
          layerOpacity={layerOpacity}
          volumeTransfer={volumeTransfer}
          modelDepths={meta.depths}
          evidencePoint={pickedPoint}
          evidenceCandidates={evidenceCandidates}
          evidenceSelection={evidenceSelection}
          scientificOpen={scientificOpen}
          waveMotion={waveMotion}
          showScientificMesh={showScientificMesh}
          neutralRelief={neutralRelief}
          searchTarget={searchTarget}
          onClearSearch={() => setSearchTarget(null)}
        />
      )}

      <Loading show={booting} text={meta ? "Rendering ocean surface…" : "Loading ocean data…"} />

      <AppNav
        mode={experienceMode}
        onMode={handleMode}
        bounds={meta?.bounds}
        searchTarget={searchTarget}
        onClearCoordinate={() => setSearchTarget(null)}
        onGuide={() => setGuideOpen(true)}
        scientificOpen={scientificOpen}
        onScientificToggle={() => {
          const next = !scientificOpen;
          setScientificOpen(next);
          setExperienceMode(next ? "analyze" : "explore");
          setOpenTab(next ? "layers" : "variable");
        }}
        onCoordinateSearch={({ lat, lon }) => {
          setView("explorer");
          setOpenTab(null);
          setSelectedFloat(null);
          setPickedPoint(null);
          setSearchTarget({ lat, lon, nonce: Date.now() });
        }}
      />

      {meta && view === "explorer" && (
        <SidePanel
          open={scientificOpen ? (openTab ?? "layers") : openTab}
          onToggle={setOpenTab}
          variables={meta.variables}
          variable={variable}
          onVariable={handleVariable}
          depths={meta.depths}
          depth={depth}
          onDepth={setDepth}
          surfaceOnly={Boolean(field?.surface)}
          variableLabel={field?.label ?? ""}
          timesteps={meta.timesteps}
          timestep={timestep}
          fetching={fetching}
          onTimestep={(t) => {
            setPlaying(false);
            setTimestep(t);
          }}
          playing={playing}
          playbackSpeed={playIntervalMs}
          onPlaybackSpeed={setPlayIntervalMs}
          onPlayToggle={() => setPlaying((p) => !p)}
          colormap={palette}
          range={manualApplied ?? range}
          scaleMode={scaleMode}
          onScaleMode={setScaleMode}
          scaleType={scaleType}
          onScaleType={setScaleTypeOverride}
          palette={palette}
          onPalette={setPaletteOverride}
          manualRange={manualRange}
          onManualRange={setManualRange}
          units={activeVar?.units ?? ""}
          renderMode={renderMode}
          onRenderMode={(mode) => { setRenderMode(mode); setSceneTool(mode === "surface" ? "2d" : mode === "volume" ? "3d" : mode); }}
          volumeAvailable={volumeAvailable && !forecastEnabled}
          showCurrents={showCurrents}
          onShowCurrents={setShowCurrents}
          showIsosurface={showIsosurface}
          onShowIsosurface={setShowIsosurface}
          isoValue={isoValue}
          onIsoValue={setIsoValue}
          isoRange={ranges?.global}
          verticalExaggeration={verticalExaggeration}
          onVerticalExaggeration={setVerticalExaggeration}
          waveMotion={waveMotion}
          onWaveMotion={setWaveMotion}
          showScientificMesh={showScientificMesh}
          onShowScientificMesh={setShowScientificMesh}
          layerOpacity={layerOpacity}
          onLayerOpacity={(name, value) => setLayerOpacity((current) => ({ ...current, [name]: value }))}
          volumeTransfer={volumeTransfer}
          onVolumeTransfer={(patch) => setVolumeTransfer((current) => ({ ...current, ...patch }))}
          forecastEnabled={forecastEnabled}
          onForecastEnabled={(enabled) => {
            setPlaying(false);
            setForecastEnabled(enabled);
            if (enabled) {
              setVariable("temperature");
              setDepth(meta.depths[0]);
              setTimestep(meta.default_timestep);
              setRenderMode("surface");
              setShowIsosurface(false);
            }
          }}
          forecastLead={forecastLead}
          onForecastLead={setForecastLead}
          instruments={floats}
          instrumentTypes={instrumentTypes}
          onInstrumentTypes={setInstrumentTypes}
          onInstrumentUpload={async (file, type) => {
            const result = await uploadInstruments(file, type);
            setFloats((current) => [...current, ...result.instruments]);
            pushToast(`Imported ${result.accepted} ${type.toUpperCase()} instrument${result.accepted === 1 ? "" : "s"}`);
          }}
          onDatasetUpload={async (file) => {
            const result = await uploadDataset(file);
            pushToast(`Validated ${result.filename}: ${result.variables.length} variables registered`);
          }}
          scientificOpen={scientificOpen}
          onStory={handleStory}
          onGuide={() => setGuideOpen(true)}
        />
      )}

      {ready && view === "explorer" && <ModePanel mode={experienceMode} variable={variable} onClose={() => handleMode("explore")} onGuide={() => setGuideOpen(true)} />}
      {ready && view === "explorer" && <SceneToolbar active={sceneTool} onTool={handleSceneTool} />}
      {ready && view === "explorer" && experienceMode !== "analyze" && !shownPoint && !shownFloat && <ContextPlaceholder field={field} />}
      {ready && view === "explorer" && experienceMode === "analyze" && !shownPoint && !shownFloat && (
        <ScienceLab
          bounds={meta.bounds}
          timestep={timestep}
          time={meta.timesteps[timestep]}
          onClose={() => handleMode("explore")}
        />
      )}

      {ready && view === "explorer" && !pickedPoint && !selectedFloat && (
        <section className="scene-context" aria-label="Current ocean view">
          <span>YOU ARE EXPLORING</span>
          <strong>{field.label}</strong>
          <p>{field.surface ? "At the sea surface" : `${field.depth} metres below the surface`} · {field.month_label}</p>
          {!field.surface && verticalExaggeration > 1 && <button onClick={() => { setScientificOpen(true); setOpenTab("layers"); }}>Depth stretched ×{verticalExaggeration} · Why?</button>}
        </section>
      )}

      {ready && view === "explorer" && (
        <div className="bottom-control-bar">
        <Colorbar
          label={sceneField.label}
          units={sceneField.units}
          colormap={sceneColormap}
          range={sceneRange}
          scaleType={sceneScaleType}
          context={`${sceneField.month_label}${sceneField.predicted ? " · PREDICTED" : sceneField.surface ? " · surface" : ` · ${sceneField.depth} m`}`}
        />
        <WorkspaceTimeline
          timesteps={meta.timesteps}
          timestep={timestep}
          playing={playing}
          onPlay={() => setPlaying((value) => !value)}
          onTimestep={(value) => { setPlaying(false); setTimestep(value); }}
        />
        <WorkspaceDepth depths={meta.depths} depth={depth} surfaceOnly={Boolean(field.surface)} onDepth={(value) => { setDepth(value); setPlaying(false); }} />
        </div>
      )}

      {ready && view === "hazard" && <Colorbar label={sceneField.label} units={sceneField.units} colormap={sceneColormap} range={sceneRange} scaleType={sceneScaleType} context={sceneField.month_label} />}

      {ready && view === "explorer" && !pickedPoint && !selectedFloat && (
        <PointTooltip point={hoverPoint} label={field.label} units={field.units} />
      )}

      {shownFloat && view === "explorer" && (
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

      {ready && view === "explorer" && shownPoint && (
        <EvidencePanel
          key={`${shownPoint.lat}-${shownPoint.lon}-${timestep}-${variable}`}
          point={shownPoint}
          closing={pointClosing}
          variable={variable}
          label={field.label}
          units={field.units}
          source={meta.source_label}
          dataset="incois_argo_mnt_VAM"
          timestep={timestep}
          time={meta.timesteps[timestep]}
          depths={meta.depths}
          range={range}
          onAnalyze={() => { setExperienceMode("analyze"); setScientificOpen(true); setOpenTab("layers"); setPickedPoint(null); }}
          onNearestValid={moveToNearestValidPoint}
          onChooseDepth={() => { setPickedPoint(null); setExperienceMode("explore"); setScientificOpen(false); setOpenTab("depth"); }}
          onCandidates={setEvidenceCandidates}
          onSelected={setEvidenceSelection}
          onClose={() => { setPickedPoint(null); setEvidenceCandidates([]); setEvidenceSelection(null); }}
        />
      )}

      {view === "hazard" && meta && (
        <HazardView
          hazard={hazard}
          loading={hazardLoading}
          timestep={timestep}
          timesteps={meta.timesteps}
          onTimestep={setTimestep}
          selectedId={selectedAdvisory?.id}
          onSelect={setSelectedAdvisory}
          metric={hazardMetric}
          onMetric={(metric) => { setHazardMetric(metric); setSelectedAdvisory(null); }}
        />
      )}

      {view === "about" && <AboutView />}

      <Splash show={splash} ready={!booting} />

      {meta && field && view !== "about" && (
        <div className="provenance-bar" title={meta.source}>
          <span><i className="source-dot" aria-hidden="true" />REAL ANALYSIS</span>
          <b>{meta.active_dataset?.id ?? "incois_argo_mnt_VAM"}</b>
          <em>{field.month_label}</em>
          <em>{field.surface ? "surface" : `${field.depth} m`}</em>
          <em>{field.shape[0]}×{field.shape[1]}</em>
          <em>QC: {meta.active_dataset?.qc_mode ?? "source QC"}</em>
          {field.provenance?.processing && <em>{field.provenance.processing}</em>}
        </div>
      )}

      {view !== "about" && (
      <button
        className="reset-view-btn"
        onClick={() => setResetSignal((n) => n + 1)}
        title="Return the camera to the default 3/4 view"
      >
        <span aria-hidden="true">⌂</span> Reset
      </button>
      )}

      {fetching && (
        <div className="fetch-chip" role="status">
          <span className="mini-spinner" /> Updating…
        </div>
      )}

      <Toast messages={toasts} onDismiss={dismissToast} />
      <WelcomeGuide open={guideOpen && ready} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
