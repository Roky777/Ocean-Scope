import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { sample } from "../colormaps";
import { HEIGHT, WIDTH, normalise } from "../grid";
import { VOLUME_DEPTH } from "./VolumeRenderer";

const WORK_COLOR = new THREE.Color();
const smooth = (value) => value * value * (3 - 2 * value);

function buildLayer(volume, depthIndex, range, colormap, scaleType, exaggeration) {
  const [, rows, columns] = volume.shape;
  const values = volume.values[depthIndex];
  const depth = volume.depths[depthIndex];
  const maxDepth = volume.depths.at(-1);
  const baseY = -(depth / maxDepth) * VOLUME_DEPTH * exaggeration;
  const nextDepth = volume.depths[Math.min(volume.depths.length - 1, depthIndex + 1)];
  const previousDepth = volume.depths[Math.max(0, depthIndex - 1)];
  const nearestGap = Math.max(1, Math.min(depth - previousDepth || Infinity, nextDepth - depth || Infinity));
  const worldGap = (nearestGap / maxDepth) * VOLUME_DEPTH * exaggeration;
  const amplitude = Math.min(0.22 * (1 - depth / maxDepth * 0.45), worldGap * 0.22);
  const positions = new Float32Array(rows * columns * 3);
  const colors = new Float32Array(rows * columns * 3);
  const indices = [];

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const value = values[row][column];
      const x = (column / (columns - 1) - 0.5) * WIDTH;
      const z = -(row / (rows - 1) - 0.5) * HEIGHT;
      const valid = value != null && Number.isFinite(value);
      const t = valid ? Math.min(1, Math.max(0, normalise(value, range.min, range.max, scaleType))) : 0.5;
      positions.set([x, baseY + amplitude * (2 * smooth(t) - 1), z], index * 3);
      const rgb = valid ? sample(colormap, t) : [0, 0, 0];
      WORK_COLOR.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
      colors.set([WORK_COLOR.r, WORK_COLOR.g, WORK_COLOR.b], index * 3);
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      if ([values[row][column], values[row][column + 1], values[row + 1][column], values[row + 1][column + 1]].some((value) => value == null || !Number.isFinite(value))) continue;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Layer({ volume, index, range, colormap, scaleType, exaggeration, wireframe }) {
  const geometry = useMemo(
    () => buildLayer(volume, index, range, colormap, scaleType, exaggeration),
    [volume, index, range, colormap, scaleType, exaggeration],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry} renderOrder={2 + index * 0.01}>
        <meshStandardMaterial vertexColors transparent opacity={0.2} roughness={0.78} metalness={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {wireframe && (
        <mesh geometry={geometry} renderOrder={3 + index * 0.01}>
          <meshBasicMaterial color="#d2e5eb" wireframe transparent opacity={0.09} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export default function InternalLayers({ volume, range, colormap, scaleType = "linear", exaggeration = 1, wireframe = false }) {
  if (!volume?.depths?.length) return null;
  return (
    <group>
      {volume.depths.map((depth, index) => (
        <Layer key={depth} volume={volume} index={index} range={range} colormap={colormap} scaleType={scaleType} exaggeration={exaggeration} wireframe={wireframe} />
      ))}
    </group>
  );
}
