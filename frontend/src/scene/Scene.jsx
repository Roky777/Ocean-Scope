import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import Terrain from "./Terrain";
import Land from "./Land";
import FloatMarkers from "./FloatMarkers";
import HazardHighlight from "./HazardHighlight";
import VolumeRenderer from "./VolumeRenderer";
import CurrentVectors from "./CurrentVectors";
import Isosurface from "./Isosurface";
import { fillGaps, upsample, WIDTH, HEIGHT, RELIEF, latToZ, lonToX } from "../grid";

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

function CoordinateFocus({ point, bounds, exaggeration }) {
  const { camera, controls } = useThree();
  const tween = useRef(null);

  useEffect(() => {
    if (!point || !bounds) return;
    const target = new THREE.Vector3(lonToX(point.lon, bounds), RELIEF * exaggeration * 0.45, latToZ(point.lat, bounds));
    const offset = new THREE.Vector3(5.5, 8.5, 8.5);
    tween.current = {
      elapsed: 0,
      fromPosition: camera.position.clone(),
      fromTarget: controls?.target?.clone() ?? HOME_TARGET.clone(),
      target,
      position: target.clone().add(offset),
    };
  }, [point, bounds, exaggeration, camera, controls]);

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

function CoordinatePin({ point, bounds, exaggeration, onClear }) {
  if (!point || !bounds) return null;
  const y = RELIEF * exaggeration + 0.18;
  return (
    <group position={[lonToX(point.lon, bounds), y, latToZ(point.lat, bounds)]}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.18, 0.27, 36]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh position-y={0.2}>
        <sphereGeometry args={[0.07, 14, 14]} />
        <meshBasicMaterial color="#7aa2ff" toneMapped={false} />
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

/** Faint reference grid on the sea floor, for depth context. */
function FloorGrid() {
  return (
    <group position-y={-0.35}>
      <gridHelper args={[Math.max(WIDTH, HEIGHT) * 1.2, 24, "#1d3350", "#132540"]} />
    </group>
  );
}

const CAMERA_HOME = [-3, 17, 24];
const HOME_POSITION = new THREE.Vector3(...CAMERA_HOME);
const HOME_TARGET = new THREE.Vector3(0, RELIEF / 2, 0);

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
  searchTarget,
  onClearSearch,
}) {
  // Bleed null (land) cells so the surface stays continuous under the coastline
  // geometry, then bilinearly upsample for a smooth mesh. Both steps are
  // display-only: the values themselves are the real INCOIS samples.
  const filled = useMemo(
    () => (field ? upsample(fillGaps(field.values), 4) : null),
    [field],
  );

  return (
    <Canvas
      className="scene-canvas"
      shadows
      camera={{ position: CAMERA_HOME, fov: 40 }}
      onPointerMissed={() => onSelectFloat(null)}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
    >
      {/* No opaque background: the CSS deep-navy gradient behind the canvas
          provides atmosphere instead of a flat void. */}
      <fog attach="fog" args={["#060d1a", 50, 104]} />

      <Stars radius={140} depth={60} count={900} factor={5} saturation={0} fade speed={0.4} />

      <ambientLight intensity={0.38} />
      <hemisphereLight args={["#8fb6ff", "#0a1220", 0.42]} />
      <directionalLight
        position={[10, 18, 8]}
        intensity={0.95}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Rim lights from behind and below so edges catch light and the
          terrain is not flatly lit from a single direction. */}
      <directionalLight position={[-14, 7, -12]} intensity={0.5} color="#4f7dff" />
      <directionalLight position={[6, -6, -14]} intensity={0.3} color="#00d5c8" />
      <pointLight position={[0, 9, 18]} intensity={0.12} color="#9fe8ff" distance={70} />

      <Suspense fallback={null}>
        {field && filled && layerOpacity.surface !== 0 && (
          <Terrain
            key={`${field.shape[0]}x${field.shape[1]}`}
            field={field}
            filled={filled}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            opacity={renderMode === "volume" && volume ? Math.min(layerOpacity.surface ?? 1, 0.16) : layerOpacity.surface ?? 1}
            exaggeration={verticalExaggeration}
            onReady={onTerrainReady}
            onHover={onHoverPoint}
            onPick={onPickPoint}
          />
        )}
        {field && renderMode === "volume" && volume && (
          <VolumeRenderer
            volume={volume}
            range={range}
            colormap={colormap}
            scaleType={scaleType}
            opacity={layerOpacity.volume ?? 0.78}
            exaggeration={verticalExaggeration}
          />
        )}
        {field && currents && (
          <CurrentVectors data={currents} opacity={layerOpacity.currents ?? 0.88} exaggeration={verticalExaggeration} />
        )}
        {isosurface && (
          <Isosurface
            data={isosurface}
            opacity={layerOpacity.isosurface ?? 0.62}
            exaggeration={verticalExaggeration}
          />
        )}
        {field && land && <Land land={land} bounds={field.bounds} exaggeration={verticalExaggeration} />}
        {field && searchTarget && (
          <CoordinatePin point={searchTarget} bounds={field.bounds} exaggeration={verticalExaggeration} onClear={onClearSearch} />
        )}
        {field && highlight && (
          <HazardHighlight advisory={highlight} bounds={field.bounds} />
        )}
        {field && filled && floats.length > 0 && (
          <FloatMarkers
            floats={floats}
            field={field}
            filled={filled}
            range={range}
            selectedId={selectedId}
            onSelect={onSelectFloat}
            exaggeration={verticalExaggeration}
          />
        )}
      </Suspense>

      <FloorGrid />

      <ResetView signal={resetSignal} />
      <CoordinateFocus point={searchTarget} bounds={field?.bounds} exaggeration={verticalExaggeration} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.07}
        target={[0, RELIEF / 2, 0]}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2.05}
      />
    </Canvas>
  );
}
