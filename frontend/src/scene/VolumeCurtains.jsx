import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { sample } from "../colormaps";
import { HEIGHT, WIDTH, latToZ, lonToX, normalise } from "../grid";
import { VOLUME_DEPTH } from "./VolumeRenderer";

const COLOR = new THREE.Color();

function createCurtainGeometry(volume, face, range, colormap, scaleType, exaggeration) {
  const [nz, ny, nx] = volume.shape;
  const maxDepth = volume.depths.at(-1);
  const positions = [];
  const colors = [];

  const point = (depthIndex, horizontalIndex) => {
    const depth = volume.depths[depthIndex];
    const y = -(depth / maxDepth) * VOLUME_DEPTH * exaggeration;
    const isFront = face === "front";
    const row = isFront ? 0 : horizontalIndex;
    const column = isFront ? horizontalIndex : 0;
    const value = volume.values[depthIndex][row][column];
    if (value == null || !Number.isFinite(value)) return null;
    const t = Math.min(1, Math.max(0, normalise(value, range.min, range.max, scaleType)));
    const fold = 0.16 * (2 * t - 1);
    const x = isFront ? lonToX(volume.lon[column], volume.bounds) : -WIDTH / 2 - 0.012 - fold;
    const z = isFront ? HEIGHT / 2 + 0.012 + fold : latToZ(volume.lat[row], volume.bounds);
    const rgb = sample(colormap, t);
    COLOR.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
    return { position: [x, y, z], color: [COLOR.r, COLOR.g, COLOR.b] };
  };

  const horizontalCount = face === "front" ? nx : ny;
  for (let k = 0; k < nz - 1; k++) {
    for (let h = 0; h < horizontalCount - 1; h++) {
      const a = point(k, h);
      const b = point(k, h + 1);
      const c = point(k + 1, h);
      const d = point(k + 1, h + 1);
      if (!a || !b || !c || !d) continue;
      for (const vertex of [a, c, b, b, c, d]) {
        positions.push(...vertex.position);
        colors.push(...vertex.color);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Curtain({ volume, face, range, colormap, scaleType, exaggeration }) {
  const geometry = useMemo(
    () => createCurtainGeometry(volume, face, range, colormap, scaleType, exaggeration),
    [volume, face, range, colormap, scaleType, exaggeration],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={0.72}
        roughness={0.82}
        metalness={0}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export default function VolumeCurtains({ volume, range, colormap, scaleType = "linear", exaggeration = 1 }) {
  if (!volume?.values?.length) return null;
  const depth = VOLUME_DEPTH * exaggeration;
  const layerMeans = volume.values.map(layer => {
    const values = layer.flat().filter(value => value != null && Number.isFinite(value));
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  });
  let thermoclineIndex = null;
  let strongestGradient = 0;
  if (volume.variable === "temperature") for (let index = 1; index < layerMeans.length; index++) {
    if (layerMeans[index] == null || layerMeans[index - 1] == null) continue;
    const gradient = Math.abs(layerMeans[index] - layerMeans[index - 1]) / Math.max(1, volume.depths[index] - volume.depths[index - 1]);
    if (gradient > strongestGradient) { strongestGradient = gradient; thermoclineIndex = index; }
  }
  return (
    <group>
      <Curtain volume={volume} face="front" range={range} colormap={colormap} scaleType={scaleType} exaggeration={exaggeration} />
      <Curtain volume={volume} face="west" range={range} colormap={colormap} scaleType={scaleType} exaggeration={exaggeration} />
      {volume.depths.map((value) => {
        const y = -(value / volume.depths.at(-1)) * depth;
        return (
          <group key={value} position-y={y}>
            <line>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[new Float32Array([-WIDTH / 2, 0, HEIGHT / 2 + 0.02, WIDTH / 2, 0, HEIGHT / 2 + 0.02]), 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#d0e1e8" transparent opacity={0.16} depthWrite={false} />
            </line>
          </group>
        );
      })}
      <Html position={[0, -depth * 0.52, HEIGHT / 2 + 0.08]} center distanceFactor={20} style={{ pointerEvents: "none" }}>
        <span className="scene-curtain-label">South cutaway · longitude × depth</span>
      </Html>
      {thermoclineIndex != null && <Html position={[WIDTH * .22, -(volume.depths[thermoclineIndex] / volume.depths.at(-1)) * depth, HEIGHT / 2 + .1]} center distanceFactor={18} style={{pointerEvents:"none"}}><span className="thermocline-label"><b>Thermocline</b><small>rapid temperature change with depth</small></span></Html>}
    </group>
  );
}
