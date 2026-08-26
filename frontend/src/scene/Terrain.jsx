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
        heights[idx] = t * RELIEF * exaggeration;
        const rgb = toLinear(...sample(colormap, t));
        colors[idx * 3] = rgb.r;
        colors[idx * 3 + 1] = rgb.g;
        colors[idx * 3 + 2] = rgb.b;
      }
    }
    return { heights, colors };
  }, [filled, range, colormap, scaleType, exaggeration, rows, cols]);

  // Heights excluding ripple, so the ripple never compounds into the data.
  const settled = useRef(new Float32Array(rows * cols));
  const from = useRef(null);
  const progress = useRef(1);
  const firstRender = useRef(true);
  const clock = useRef(0);

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
    clock.current += delta * RIPPLE_SPEED;

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
        const ripple =
          RIPPLE_AMP * Math.sin(c * 0.26 + time * 1.1) * Math.cos(phaseR + time * 0.8);
        pos.setZ(i, settled.current[i] + ripple);
      }
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  // --- point inspection ---------------------------------------------------
  const report = (e, handler) => {
    if (!handler || !field) return;
    const { lat, lon } = worldToLatLon(e.point.x, e.point.z, field.bounds);
    const value = sampleValueAt(field, lat, lon);
    handler({ lat, lon, value, clientX: e.clientX, clientY: e.clientY });
  };

  return (
    <mesh
      geometry={geometry}
      rotation-x={-Math.PI / 2}
      receiveShadow
      onPointerMove={(e) => {
        e.stopPropagation();
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
      <meshPhysicalMaterial
        ref={matRef}
        vertexColors
        transparent
        opacity={0}
        roughness={0.52}
        metalness={0.0}
        clearcoat={0.45}
        clearcoatRoughness={0.4}
        side={THREE.DoubleSide}
        wireframe={Boolean(field.predicted)}
      />
    </mesh>
  );
}
