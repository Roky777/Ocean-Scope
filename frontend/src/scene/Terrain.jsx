import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sample } from "../colormaps";
import {
  WIDTH,
  HEIGHT,
  RELIEF,
  normalise,
  worldToLatLon,
  sampleValueAt,
  upsample,
} from "../grid";

const TRANSITION_MS = 420; // spec: 300-500ms eased transition on data change

// Ambient motion. Deliberately tiny - the surface should read as fluid, not
// as cartoon waves, so this is ~1% of the vertical relief.
const RIPPLE_AMP = 0.014;
const RIPPLE_SPEED = 0.55;

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// Colormap stops are sRGB. Three.js expects vertex colours in the renderer's
// working (linear) space, so feeding sRGB straight in washes every colour out.
const CONVERT = new THREE.Color();
const toLinear = (r, g, b) => CONVERT.setRGB(r, g, b, THREE.SRGBColorSpace);

/**
 * The ocean surface: a plane whose vertex heights AND vertex colours both
 * encode the active variable, so it reads like a bathymetry/VAPOR-style relief.
 *
 * Data changes are eased over TRANSITION_MS rather than jumping, and a very
 * small travelling ripple runs on top so the surface never looks frozen.
 */
export default function Terrain({
  field,
  filled,
  range,
  colormap,
  scaleType = "linear",
  opacity = 1,
  exaggeration = 1,
  waveMotion = true,
  showWireframe = false,
  neutralRelief = false,
  onReady,
  onHover,
  onPick,
}) {
  const matRef = useRef(null);

  const rows = filled.length;
  const cols = filled[0].length;

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(WIDTH, HEIGHT, cols - 1, rows - 1);
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(rows * cols * 3), 3),
    );
    return g;
  }, [rows, cols]);

  const coastalWeights = useMemo(() => {
    const source = field.values;
    const nativeRows = source.length;
    const nativeColumns = source[0].length;
    const weights = source.map((row, rowIndex) => row.map((value, columnIndex) => {
      if (value == null) return 0;
      let valid = 0;
      let total = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = rowIndex + dr;
          const c = columnIndex + dc;
          if (r < 0 || c < 0 || r >= nativeRows || c >= nativeColumns) continue;
          total++;
          if (source[r][c] != null) valid++;
        }
      }
      return Math.min(1, Math.max(0.18, valid / Math.max(1, total)));
    }));
    const factor = Math.max(1, Math.round((rows - 1) / Math.max(1, nativeRows - 1)));
    return upsample(weights, factor);
  }, [field.values, rows]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Target height + colour for every vertex, derived from the current slice.
  const target = useMemo(() => {
    const heights = new Float32Array(rows * cols);
    const colors = new Float32Array(rows * cols * 3);

    for (let r = 0; r < rows; r++) {
      // PlaneGeometry row 0 is the +Y edge, which becomes north after the mesh
      // is rotated flat; grid row 0 is the southernmost latitude.
      const gridRow = rows - 1 - r;
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const t = normalise(filled[gridRow][c], range.min, range.max, scaleType);
        const softened = t * t * (3 - 2 * t);
        heights[idx] = RELIEF * exaggeration * (2 * softened - 1) * coastalWeights[gridRow][c];
        const rgb = toLinear(...sample(colormap, t));
        colors[idx * 3] = rgb.r;
        colors[idx * 3 + 1] = rgb.g;
        colors[idx * 3 + 2] = rgb.b;
      }
    }
    return { heights, colors };
  }, [filled, range, colormap, scaleType, exaggeration, coastalWeights, rows, cols]);

  // Heights excluding ripple, so the ripple never compounds into the data.
  const settled = useRef(new Float32Array(rows * cols));
  const from = useRef(null);
  const progress = useRef(1);
  const firstRender = useRef(true);
  const clock = useRef(0);
  const rippleAccumulator = useRef(0);
  const normalAccumulator = useRef(0);
  const lastHoverReport = useRef(0);

  useEffect(() => {
    if (settled.current.length !== rows * cols) {
      settled.current = new Float32Array(rows * cols);
    }
    const col = geometry.attributes.color;

    if (firstRender.current) {
      // First slice: start flat and dark, then rise into view.
      from.current = {
        heights: new Float32Array(rows * cols),
        colors: new Float32Array(rows * cols * 3),
      };
      firstRender.current = false;
    } else {
      from.current = { heights: settled.current.slice(), colors: col.array.slice() };
    }
    progress.current = 0;
  }, [target, geometry, rows, cols]);

  useEffect(() => {
    if (matRef.current && progress.current >= 1) matRef.current.opacity = opacity;
  }, [opacity]);

  useFrame((_, delta) => {
    const transitioning = progress.current < 1;
    rippleAccumulator.current += delta;
    // The ambient ripple does not need to update at display refresh rate.
    // Capping this tiny decorative motion at 24 Hz removes most idle CPU work.
    if (!transitioning && rippleAccumulator.current < 1 / 24) return;
    const simulationDelta = rippleAccumulator.current;
    rippleAccumulator.current = 0;
    normalAccumulator.current += simulationDelta;
    clock.current += simulationDelta * RIPPLE_SPEED;

    const pos = geometry.attributes.position;
    const col = geometry.attributes.color;

    if (progress.current < 1) {
      progress.current = Math.min(1, progress.current + (delta * 1000) / TRANSITION_MS);
      const t = easeInOutCubic(progress.current);
      const { heights: h0, colors: c0 } = from.current;
      const { heights: h1, colors: c1 } = target;

      for (let i = 0; i < h1.length; i++) {
        settled.current[i] = h0[i] + (h1[i] - h0[i]) * t;
        const j = i * 3;
        col.array[j] = c0[j] + (c1[j] - c0[j]) * t;
        col.array[j + 1] = c0[j + 1] + (c1[j + 1] - c0[j + 1]) * t;
        col.array[j + 2] = c0[j + 2] + (c1[j + 2] - c0[j + 2]) * t;
      }
      col.needsUpdate = true;

      if (matRef.current && matRef.current.opacity < opacity) {
        matRef.current.opacity = Math.min(opacity, matRef.current.opacity + delta * 2.2);
      }
      if (progress.current >= 1) onReady?.();
    }

    // Ripple rides on top of the settled heights every frame.
    const time = clock.current;
    for (let r = 0; r < rows; r++) {
      const phaseR = r * 0.32;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const ripple = waveMotion && exaggeration > 0
          ? RIPPLE_AMP * Math.min(1, exaggeration / 0.2) * (
              Math.sin(c * 0.26 + time * 1.1) * Math.cos(phaseR + time * 0.8) +
              0.45 * Math.cos(c * 0.14 - r * 0.2 + time * 0.55)
            )
          : 0;
        pos.setZ(i, settled.current[i] + ripple);
      }
    }
    pos.needsUpdate = true;
    // Normal generation is much more expensive than moving vertices. The tiny
    // decorative ripple does not need fresh normals; refresh them only during
    // a scientific data transition (12 Hz) and once when it settles.
    const transitionFinished = transitioning && progress.current >= 1;
    if ((transitioning && normalAccumulator.current >= 1 / 12) || transitionFinished) {
      geometry.computeVertexNormals();
      normalAccumulator.current = 0;
    }
  });

  // --- point inspection ---------------------------------------------------
  const report = (e, handler) => {
    if (!handler || !field) return;
    const { lat, lon } = worldToLatLon(e.point.x, e.point.z, field.bounds);
    const value = sampleValueAt(field, lat, lon);
    handler({ lat, lon, value, clientX: e.clientX, clientY: e.clientY });
  };

  const terrainMesh = (
    <mesh
      geometry={geometry}
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
        const now = performance.now();
        if (now - lastHoverReport.current < 48) return;
        lastHoverReport.current = now;
        report(e, onHover);
      }}
      onPointerOut={() => onHover?.(null)}
      onClick={(e) => {
        e.stopPropagation();
        report(e, onPick);
      }}
    >
      {/*
        Physical rather than standard material: the clearcoat layer adds a
        Schlick-Fresnel specular lobe that brightens at grazing angles and
        slides as the camera orbits, which is what makes a surface read as
        water rather than matte clay.
      */}
      <meshStandardMaterial
        ref={matRef}
        vertexColors={!neutralRelief}
        color={neutralRelief ? "#8d969b" : "#ffffff"}
        transparent
        opacity={0}
        roughness={0.72}
        metalness={0.0}
        side={THREE.DoubleSide}
        wireframe={Boolean(field.predicted)}
      />
    </mesh>
  );
  return (
    <group rotation-x={-Math.PI / 2}>
      {terrainMesh}
      {showWireframe && (
        <mesh geometry={geometry}>
          <meshBasicMaterial color="#d5e5ea" wireframe transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
