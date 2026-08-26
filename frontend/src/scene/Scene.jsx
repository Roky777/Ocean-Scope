import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import Terrain from "./Terrain";
import Land from "./Land";
import FloatMarkers from "./FloatMarkers";
import HazardHighlight from "./HazardHighlight";
import { fillGaps, upsample, WIDTH, HEIGHT, RELIEF } from "../grid";

/**
 * Eases the camera back to its default framing when `signal` changes.
 * Tweened rather than snapped, so "Reset view" never feels like a jump cut.
 */
function ResetView({ signal, target }) {
  const { camera, controls } = useThree();
  const tween = useRef(null);

  useEffect(() => {
    if (signal === 0) return; // no reset on first mount
    tween.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controls?.target?.clone() ?? new THREE.Vector3(...target),
    };
  }, [signal, camera, controls, target]);

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
    if (tw.t >= 1) tween.current = null;
  });

  return null;
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
  land,
  floats,
  highlight,
  selectedId,
  onSelectFloat,
  onTerrainReady,
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
        {field && filled && (
          <Terrain
            key={`${field.shape[0]}x${field.shape[1]}`}
            field={field}
            filled={filled}
            range={range}
            colormap={colormap}
            onReady={onTerrainReady}
            onHover={onHoverPoint}
            onPick={onPickPoint}
          />
        )}
        {field && land && <Land land={land} bounds={field.bounds} />}
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
          />
        )}
      </Suspense>

      <FloorGrid />

      <ResetView signal={resetSignal} target={[0, RELIEF / 2, 0]} />

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
