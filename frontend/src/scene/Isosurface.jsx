import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { latToZ, lonToX } from "../grid";
import { VOLUME_DEPTH } from "./VolumeRenderer";

export default function Isosurface({ data, opacity = 0.62, exaggeration = 1 }) {
  const geometry = useMemo(() => {
    if (!data?.vertices?.length) return null;
    const maxDepth = data.depth_range[1];
    const positions = new Float32Array(data.vertices.length * 3);
    data.vertices.forEach(([lon, depth, lat], i) => {
      positions[i * 3] = lonToX(lon, data.bounds);
      positions[i * 3 + 1] = -(depth / maxDepth) * VOLUME_DEPTH * exaggeration;
      positions[i * 3 + 2] = latToZ(lat, data.bounds);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }, [data, exaggeration]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshStandardMaterial
        color="#ffcf62"
        emissive="#8c3d13"
        emissiveIntensity={0.35}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        roughness={0.42}
      />
    </mesh>
  );
}
