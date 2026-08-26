import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { lonToX, latToZ, RELIEF } from "../grid";

/**
 * Marks the region an advisory refers to: a slowly pulsing ring dropped onto
 * the terrain at the advisory's peak cell, with a column so it stays findable
 * from any camera angle.
 */
export default function HazardHighlight({ advisory, bounds }) {
  const ring = useRef(null);
  const pulse = useRef(0);

  useFrame((_, delta) => {
    pulse.current += delta;
    if (!ring.current) return;
    const k = 1 + Math.sin(pulse.current * 2.1) * 0.16;
    ring.current.scale.set(k, k, 1);
    ring.current.material.opacity = 0.55 + Math.sin(pulse.current * 2.1) * 0.2;
  });

  if (!advisory || !bounds) return null;

  const colour =
    advisory.severity === "high"
      ? "#ff5a4d"
      : advisory.severity === "moderate"
        ? "#ffb020"
        : "#57d0a0";

  const x = lonToX(advisory.lon, bounds);
  const z = latToZ(advisory.lat, bounds);

  return (
    <group position={[x, 0, z]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={RELIEF * 1.06}>
        <ringGeometry args={[0.55, 0.72, 48]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position-y={RELIEF * 1.6}>
        <cylinderGeometry args={[0.03, 0.03, RELIEF * 1.1, 8]} />
        <meshBasicMaterial color={colour} transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}
