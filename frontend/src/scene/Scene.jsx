import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import Terrain from "./Terrain";
import Land from "./Land";
import FloatMarkers from "./FloatMarkers";
import HazardHighlight from "./HazardHighlight";
import VolumeRenderer, { VOLUME_DEPTH } from "./VolumeRenderer";
import CurrentVectors from "./CurrentVectors";
import Isosurface from "./Isosurface";
import WaterColumnContext from "./WaterColumnContext";
import VolumeCurtains from "./VolumeCurtains";
import InternalLayers from "./InternalLayers";
import { fillGaps, upsample, latToZ, lonToX } from "../grid";

const MAP_LABELS = [
  { name: "INDIA", lat: 20.5, lon: 78.8, land: true },
  { name: "ARABIAN SEA", lat: 14.5, lon: 68.7 },
  { name: "BAY OF BENGAL", lat: 15.5, lon: 88.2 },
  { name: "SRI LANKA", lat: 7.7, lon: 80.7, land: true },
];

function MapLabels({ bounds }) {
  return <>{MAP_LABELS.filter(item => item.lat >= bounds.lat_min && item.lat <= bounds.lat_max && item.lon >= bounds.lon_min && item.lon <= bounds.lon_max).map(item =>
    <Html key={item.name} position={[lonToX(item.lon, bounds), item.land ? .32 : .22, latToZ(item.lat, bounds)]} center distanceFactor={17} style={{ pointerEvents: "none" }}>
      <span className={item.land ? "map-place-label land" : "map-place-label"}>{item.name}</span>
    </Html>
  )}</>;
}

/**
 * Eases the camera back to its default framing when `signal` changes.
 * Tweened rather than snapped, so "Reset view" never feels like a jump cut.
 */
function ResetView({ signal }) {
  const { camera, controls } = useThree();
  const tween = useRef(null);
  const lastSignal = useRef(0);

  // Only ever react to a genuinely NEW signal. The previous version also
  // depended on a `target` array literal that was rebuilt on every render, so
  // any re-render restarted the tween — the camera lerped home forever and
  // overrode the user's input, which is what made the view feel stuck.
  useEffect(() => {
    if (signal === 0 || signal === lastSignal.current) return;
    lastSignal.current = signal;
    tween.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controls?.target?.clone() ?? HOME_TARGET.clone(),
    };
  }, [signal, camera, controls]);

  // Any manual interaction cancels the tween, so the two never fight for the
  // camera. Without this a drag mid-flight stutters against the lerp.
  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      tween.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, delta) => {
    const tw = tween.current;
    if (!tw) return;

    tw.t = Math.min(1, tw.t + delta / 0.65);
    const e = 1 - Math.pow(1 - tw.t, 3); // ease-out cubic

    camera.position.lerpVectors(tw.fromPos, HOME_POSITION, e);
    if (controls) {
      controls.target.lerpVectors(tw.fromTarget, HOME_TARGET, e);
      controls.update();
    }
    if (tw.t >= 1) {
      tween.current = null;
      // Hand control back cleanly: sync OrbitControls' internal spherical
      // state to where we actually left the camera.
      controls?.update();
    }
  });

  return null;
}

function CoordinateFocus({ point, bounds }) {
  const { camera, controls } = useThree();
  const tween = useRef(null);

  useEffect(() => {
    if (!point || !bounds) return;
    const target = new THREE.Vector3(lonToX(point.lon, bounds), 0.08, latToZ(point.lat, bounds));
    const offset = new THREE.Vector3(5.5, 8.5, 8.5);
    tween.current = {
      elapsed: 0,
      fromPosition: camera.position.clone(),
      fromTarget: controls?.target?.clone() ?? HOME_TARGET.clone(),
      target,
      position: target.clone().add(offset),
    };
  }, [point, bounds, camera, controls]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => { tween.current = null; };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, delta) => {
    if (!tween.current) return;
    const tw = tween.current;
    tw.elapsed = Math.min(1, tw.elapsed + delta / 0.85);
    const t = 1 - Math.pow(1 - tw.elapsed, 3);
    camera.position.lerpVectors(tw.fromPosition, tw.position, t);
    if (controls) {
      controls.target.lerpVectors(tw.fromTarget, tw.target, t);
      controls.update();
    }
    if (tw.elapsed >= 1) tween.current = null;
  });
  return null;
}

function CoordinatePin({ point, bounds, onClear }) {
  if (!point || !bounds) return null;
  const y = 0.18;
  return (
    <group position={[lonToX(point.lon, bounds), y, latToZ(point.lat, bounds)]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.18, 0.27, 36]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={0.2}>
        <sphereGeometry args={[0.07, 14, 14]} />
        <meshBasicMaterial color="#d5d7da" toneMapped={false} />
      </mesh>
      <Html center position={[0, 0.62, 0]} distanceFactor={14}>
        <div className="coordinate-label">
          <strong>{Math.abs(point.lat).toFixed(2)}° {point.lat >= 0 ? "N" : "S"}</strong>
          <span>{Math.abs(point.lon).toFixed(2)}° {point.lon >= 0 ? "E" : "W"}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClear?.();
            }}
            aria-label="Remove searched location"
            title="Remove searched location"
          >×</button>
        </div>
      </Html>
    </group>
  );
}

function AnimatedDepthLayer({ y, children }) {
  const group = useRef(null);
  const target = useRef(y);
  useEffect(() => { target.current = y; }, [y]);
  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, target.current, 7, delta);
  });
  return <group ref={group} position-y={y}>{children}</group>;
}

function EvidenceContext({ point, observation, bounds, field, range, maxDepth, exaggeration }) {
  if (!point || !bounds) return null;
  const selectedY = maxDepth ? -(point.depth / maxDepth) * VOLUME_DEPTH * exaggeration + .18 : .18;
  const start = [lonToX(point.lon, bounds), selectedY, latToZ(point.lat, bounds)];
  const end = observation ? [lonToX(observation.lon, bounds), 0.34, latToZ(observation.lat, bounds)] : null;
  const unit = field?.units === "degC" ? "°C" : field?.units ?? "";
  const relative = point.value == null || !range ? "No model value" : point.value > range.max - (range.max - range.min) * .35 ? "Warmer than nearby water" : point.value < range.min + (range.max - range.min) * .35 ? "Cooler than nearby water" : "Near the middle of the visible range";
  return <>
    <group position={[start[0], 0, start[2]]}>
      <Line points={[[0,.25,0],[0,selectedY,0]]} color="#c8cace" lineWidth={1} transparent opacity={.58}/>
      <group position-y={selectedY}>
      <mesh rotation-x={-Math.PI / 2}><ringGeometry args={[0.24, 0.31, 40]}/><meshBasicMaterial color="#ffffff" transparent opacity={0.95} side={THREE.DoubleSide}/></mesh>
      <mesh position-y={0.08}><sphereGeometry args={[0.075, 14, 14]}/><meshBasicMaterial color="#d5d7da" toneMapped={false}/></mesh>
      {!observation && (
        <Line points={[[0,.1,0],[0,.62,0]]} color="#c8cace" lineWidth={1} transparent opacity={.75}/>
      )}
      {!observation && <Html position={[0,.8,0]} center distanceFactor={15} style={{pointerEvents:"none"}}>
        <div className="selected-scene-label"><strong>{point.value == null ? "No data" : `${point.value.toFixed(2)} ${unit}`}</strong><span>at ~{point.depth} m</span><small>{relative}</small></div>
      </Html>}
      </group>
    </group>
    {end && (
      <Line points={[start, [start[0], 0.52, start[2]], [end[0], 0.52, end[2]], end]}
        color="#f5d36b" lineWidth={1.5} dashed dashSize={0.18} gapSize={0.11}
        transparent opacity={0.8}/>
    )}
  </>;
}

const CAMERA_HOME = [-13, 13, 23];
const HOME_POSITION = new THREE.Vector3(...CAMERA_HOME);
const HOME_TARGET = new THREE.Vector3(0, -2.8, 0);

export default function Scene({
  resetSignal,
  field,
  onHoverPoint,
  onPickPoint,
  range,
  colormap,
  scaleType,
  land,
  floats,
  highlight,
  selectedId,
  onSelectFloat,
  onTerrainReady,
  renderMode = "surface",
  volume,
  currents,
  isosurface,
  verticalExaggeration = 1,
  layerOpacity = {},
  volumeTransfer = {},
  modelDepths = [],
  evidencePoint,
  evidenceCandidates = [],
  evidenceSelection,
  scientificOpen = false,
  waveMotion = true,
  showScientificMesh = false,
  neutralRelief = false,
  searchTarget,
  onClearSearch,
}) {
  // Bleed null (land) cells so the surface stays continuous under the coastline
  // geometry, then bilinearly upsample for a smooth mesh. Both steps are
  // display-only: the values themselves are the real INCOIS samples.
  const filled = useMemo(
    // 3x is visually smooth at the current camera distance while keeping the
    // animated surface near 31k vertices instead of ~55k at 4x.
    () => (field ? upsample(fillGaps(field.values), 3) : null),
    [field],
  );

  return (
    <Canvas
      className="scene-canvas"
      shadows="basic"
      camera={{ position: CAMERA_HOME, fov: 40 }}
      onPointerMissed={() => onSelectFloat(null)}
      dpr={[1, typeof window !== "undefined" && window.innerWidth < 760 ? 1 : 1.25]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
    >
      {/* No opaque background: the CSS deep-navy gradient behind the canvas
          provides atmosphere instead of a flat void. */}
      <fog attach="fog" args={["#090a0c", 46, 92]} />

      {/* Keep the fill restrained so the displaced mesh retains readable
          highlights and shadows instead of looking like a flat heat map. */}
      <ambientLight intensity={0.34} />
      <hemisphereLight args={["#c4c6c9", "#090a0c", 0.46]} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={1.18}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-14, 7, -12]} intensity={0.28} color="#86a2b4" />

      <Suspense fallback={null}>
        {field && filled && layerOpacity.surface !== 0 && (
          <AnimatedDepthLayer y={renderMode === "slice" && volume?.depths?.length ? -VOLUME_DEPTH * verticalExaggeration * (field.depth / volume.depths.at(-1)) : 0}>
          <Terrain
            key={`${field.shape[0]}x${field.shape[1]}`}
            field={field}
            filled={filled}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            opacity={renderMode === "volume" && volume ? Math.min(layerOpacity.surface ?? 1, 0.72) : layerOpacity.surface ?? 1}
            exaggeration={
              renderMode === "slice"
                ? 0.08
                : renderMode === "surface"
                  ? 0.52
                  : 0.22
            }
            waveMotion={waveMotion}
            showWireframe={showScientificMesh}
            neutralRelief={neutralRelief}
            transfer={volumeTransfer}
            onReady={onTerrainReady}
            onHover={onHoverPoint}
            onPick={onPickPoint}
          /></AnimatedDepthLayer>
        )}
        {scientificOpen && field && ["surface", "volume", "isosurface"].includes(renderMode) && (
          <Html position={[-6.8, 0.95, 5.7]} center distanceFactor={19} style={{ pointerEvents: "none" }}>
            <span className="scene-relief-label">Analytical relief · vertically exaggerated</span>
          </Html>
        )}
        {field && !neutralRelief && renderMode === "volume" && volume && (
          <VolumeRenderer
            volume={volume}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            opacity={layerOpacity.volume ?? 0.78}
            exaggeration={verticalExaggeration}
            transfer={volumeTransfer}
          />
        )}
        {field && !neutralRelief && renderMode === "volume" && volume && (
          <InternalLayers
            volume={volume}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            exaggeration={verticalExaggeration}
            wireframe={showScientificMesh}
          />
        )}
        {field && !neutralRelief && renderMode === "volume" && volume && (
          <VolumeCurtains
            volume={volume}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            exaggeration={verticalExaggeration}
          />
        )}
        {field && !neutralRelief && volume?.depths?.length && ["slice", "volume", "isosurface"].includes(renderMode) && (
          <WaterColumnContext
            depths={volume.depths}
            exaggeration={verticalExaggeration}
            activeDepth={field.depth}
            showSlice={renderMode === "slice"}
          />
        )}
        {field && !neutralRelief && currents && (
          <CurrentVectors data={currents} opacity={layerOpacity.currents ?? 0.88} field={field} filled={filled} range={range} scaleType={scaleType} />
        )}
        {!neutralRelief && isosurface && (
          <Isosurface
            data={isosurface}
            opacity={layerOpacity.isosurface ?? 0.62}
            exaggeration={verticalExaggeration}
          />
        )}
        {field && land && <Land land={land} bounds={field.bounds} />}
        {field && <MapLabels bounds={field.bounds} />}
        {field && searchTarget && (
          <CoordinatePin point={searchTarget} bounds={field.bounds} onClear={onClearSearch} />
        )}
        {field && highlight && (
          <HazardHighlight advisory={highlight} bounds={field.bounds} />
        )}
        {field && !neutralRelief && filled && floats.length > 0 && (
          <FloatMarkers
            floats={floats}
            field={field}
            filled={filled}
            range={range}
            selectedId={selectedId}
            onSelect={onSelectFloat}
            exaggeration={verticalExaggeration}
            colormap={colormap}
            scaleType={scaleType}
            modelDepths={volume?.depths ?? modelDepths}
            evidenceCandidates={evidenceCandidates}
          />
        )}
        {field && evidencePoint && (
          <EvidenceContext point={evidencePoint} observation={evidenceSelection} bounds={field.bounds} field={field} range={range} maxDepth={modelDepths.at(-1)} exaggeration={verticalExaggeration}/>
        )}
      </Suspense>

      <ResetView signal={resetSignal} />
      <CoordinateFocus point={searchTarget} bounds={field?.bounds} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        target={[0, -2.8, 0]}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}
