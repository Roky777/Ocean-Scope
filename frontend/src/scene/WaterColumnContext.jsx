import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { HEIGHT, WIDTH } from "../grid";
import { VOLUME_DEPTH } from "./VolumeRenderer";

/**
 * Scientific cutaway context around the real model volume. The lower surface
 * is deliberately flat because no bathymetry grid is bundled with OceanScope.
 * It must not be mistaken for measured seafloor topography.
 */
export default function WaterColumnContext({ depths, exaggeration = 1, activeDepth = null, showSlice = false }) {
  const safeDepths = depths ?? [];
  const maxDepth = safeDepths.at(-1) ?? 1;
  const worldDepth = VOLUME_DEPTH * exaggeration;
  const labels = safeDepths.length <= 6
    ? safeDepths
    : [safeDepths[0], safeDepths[Math.floor(safeDepths.length / 2)], maxDepth];
  const boundary = useMemo(() => new THREE.BoxGeometry(WIDTH, worldDepth, HEIGHT), [worldDepth]);
  const edges = useMemo(() => new THREE.EdgesGeometry(boundary), [boundary]);
  const floor = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, 28, 20);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const y = position.getY(index);
      const relief = 0.09 * Math.sin(x * .65) * Math.cos(y * .52) + 0.035 * Math.sin((x + y) * 1.4);
      position.setZ(index, relief);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useEffect(() => () => {
    edges.dispose();
    boundary.dispose();
    floor.dispose();
  }, [boundary, edges, floor]);
  if (!safeDepths.length) return null;

  return (
    <group>
      <mesh geometry={boundary} position={[0, -worldDepth / 2, 0]} renderOrder={0}>
        <meshBasicMaterial
          color="#555a60"
          transparent
          opacity={0.035}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={edges} position={[0, -worldDepth / 2, 0]} renderOrder={4}>
        <lineBasicMaterial color="#8d9298" transparent opacity={0.25} depthWrite={false} />
      </lineSegments>

      {/* Desaturated water backing keeps sparse edge samples from reading as
          a pitch-black wall while the real scalar curtains remain on top. */}
      <mesh position={[0, -worldDepth / 2, HEIGHT / 2 + 0.02]} renderOrder={5}>
        <planeGeometry args={[WIDTH, worldDepth]} />
        <meshBasicMaterial color="#555b62" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-WIDTH / 2 - 0.02, -worldDepth / 2, 0]} rotation-y={Math.PI / 2} renderOrder={5}>
        <planeGeometry args={[HEIGHT, worldDepth]} />
        <meshBasicMaterial color="#464c53" transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* A clearly labelled, physically plausible floor is used because this
          dataset does not bundle measured bathymetry. */}
      <mesh geometry={floor} position={[0, -worldDepth - 0.04, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshStandardMaterial color="#292c30" roughness={0.98} metalness={0} />
      </mesh>

      {labels.map((depth) => {
        const y = -(depth / maxDepth) * worldDepth;
        return (
          <group key={depth} position={[-WIDTH / 2 - 0.06, y, HEIGHT / 2]}>
            <mesh rotation-y={Math.PI / 2}>
              <planeGeometry args={[0.22, 0.012]} />
              <meshBasicMaterial color="#b4b7bb" transparent opacity={0.62} side={THREE.DoubleSide} />
            </mesh>
            <Html position={[-0.25, 0, 0]} center distanceFactor={18} style={{ pointerEvents: "none" }}>
              <span className="scene-depth-label">{depth} m</span>
            </Html>
          </group>
        );
      })}

      {showSlice && activeDepth != null && (
        <Html
          position={[-WIDTH / 2 + 0.7, -(activeDepth / maxDepth) * worldDepth + 0.12, HEIGHT / 2]}
          center
          distanceFactor={17}
          style={{ pointerEvents: "none" }}
        >
          <span className="scene-slice-label">Depth slice · {activeDepth} m</span>
        </Html>
      )}
      <Html position={[-WIDTH / 2 + 2.1, -worldDepth - 0.08, HEIGHT / 2]} center distanceFactor={19} style={{ pointerEvents: "none" }}>
        <span className="scene-base-label">Simplified Indian Ocean floor · bathymetry unavailable</span>
      </Html>
    </group>
  );
}
