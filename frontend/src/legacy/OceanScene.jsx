import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { colormap, normalise } from "./colormap";

// Domain box in world units. Lat/lon are mapped linearly into this box:
// this is a flat, approximate projection, NOT a geographic one.
const WIDTH = 12; // along X (longitude)
const HEIGHT = 12; // along Z (latitude)
const DEPTH_SPAN = 6; // world units for the full 0..MAX_DEPTH range
const MAX_DEPTH = 1000;

const depthToY = (d) => -(d / MAX_DEPTH) * DEPTH_SPAN;

function lonToX(lon, b) {
  return ((lon - b.lon_min) / (b.lon_max - b.lon_min) - 0.5) * WIDTH;
}
// Higher latitude (north) maps to -Z, matching the plane's local +Y after
// it is rotated flat.
function latToZ(lat, b) {
  return -(((lat - b.lat_min) / (b.lat_max - b.lat_min)) - 0.5) * HEIGHT;
}

/** The temperature slice, drawn as a textured plane at its depth. */
function SlicePlane({ slice }) {
  const texture = useMemo(() => {
    const { values, global_range } = slice;
    const rows = values.length;
    const cols = values[0].length;
    const data = new Uint8Array(rows * cols * 4);

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const v = values[i][j];
        const idx = (i * cols + j) * 4;
        if (v === null) {
          data[idx + 3] = 0; // missing / land -> transparent
          continue;
        }
        const [r, g, b] = colormap(normalise(v, global_range.min, global_range.max));
        data[idx] = r * 255;
        data[idx + 1] = g * 255;
        data[idx + 2] = b * 255;
        data[idx + 3] = 255;
      }
    }

    // Row 0 of `values` is the southernmost latitude and maps to v=0, which
    // is the plane's local -Y edge -> south. DataTexture does not flip Y.
    const tex = new THREE.DataTexture(data, cols, rows, THREE.RGBAFormat);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, [slice]);

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={depthToY(slice.depth)}>
      <planeGeometry args={[WIDTH, HEIGHT]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent />
    </mesh>
  );
}

/** Argo floats as spheres, coloured by their own temperature reading. */
function FloatMarkers({ floats, bounds, range, selectedId, onSelect }) {
  return floats.map((f) => {
    const [r, g, b] = colormap(normalise(f.temperature, range.min, range.max));
    const isSelected = f.id === selectedId;
    const radius = isSelected ? 0.26 : 0.17;
    return (
      <group
        key={f.id}
        // Floats sit within a few metres of the surface, so their true depth
        // would bury them inside the 0 m plane. Lift by the sphere radius so
        // each marker rests on the surface and stays clickable.
        position={[
          lonToX(f.lon, bounds),
          depthToY(f.depth) + radius,
          latToZ(f.lat, bounds),
        ]}
      >
        {/* White shell, rendered back-face, gives each marker an outline that
            reads against a same-coloured plane. */}
        <mesh scale={1.35}>
          <sphereGeometry args={[radius, 20, 20]} />
          <meshBasicMaterial color="#f2f8ff" side={THREE.BackSide} />
        </mesh>
        <mesh
          onClick={(e) => {
            e.stopPropagation();
            onSelect(f);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "auto";
          }}
        >
          <sphereGeometry args={[radius, 24, 24]} />
          <meshStandardMaterial
            color={new THREE.Color(r, g, b)}
            roughness={0.35}
            metalness={0.0}
          />
        </mesh>
        {/* Stem down to the deepest level, so the marker reads as a position. */}
        <mesh position-y={-DEPTH_SPAN / 2 - radius}>
          <cylinderGeometry args={[0.012, 0.012, DEPTH_SPAN, 6]} />
          <meshBasicMaterial color="#7ea8c4" transparent opacity={isSelected ? 0.55 : 0.2} />
        </mesh>
      </group>
    );
  });
}

/** Wireframe box marking the modelled volume, for depth context. */
function DomainBox() {
  return (
    <group position-y={-DEPTH_SPAN / 2}>
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(WIDTH, DEPTH_SPAN, HEIGHT)]} />
        <lineBasicMaterial color="#2f5068" />
      </lineSegments>
    </group>
  );
}

export default function OceanScene({ slice, floats, selectedId, onSelect }) {
  return (
    <Canvas
      camera={{ position: [14, 9, 16], fov: 45 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#0a1622"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={0.9} />

      {slice && <SlicePlane slice={slice} />}
      {slice && floats.length > 0 && (
        <FloatMarkers
          floats={floats}
          bounds={slice.bounds}
          range={slice.global_range}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      )}
      <DomainBox />

      <OrbitControls enableDamping dampingFactor={0.08} target={[0, -2.2, 0]} />
    </Canvas>
  );
}
