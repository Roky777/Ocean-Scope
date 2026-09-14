import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Html } from "@react-three/drei";
import { latToZ, lonToX, RELIEF, sampleNormalised } from "../grid";

function Glyph({ vector, bounds, opacity, index, field, filled, range, scaleType }) {
  const pulse = useRef(null);
  const speed = Math.max(0.01, vector.speed);
  const length = Math.min(1.25, 0.35 + Math.sqrt(speed) * 0.45);
  // +X is east and -Z is north in the regional map. A positive mathematical
  // Y component therefore becomes negative world Z after rotation.
  const angle = Math.atan2(vector.v, vector.u);
  const valuePosition = sampleNormalised(filled, vector.lat, vector.lon, field, range, scaleType);
  const softened = valuePosition * valuePosition * (3 - 2 * valuePosition);
  const surfaceY = RELIEF * 0.22 * (2 * softened - 1) + 0.18;
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const phase = (clock.elapsedTime * (0.45 + Math.min(speed, 1.5)) + index * 0.137) % 1;
    pulse.current.position.x = phase * length;
  });
  return (
    <group position={[lonToX(vector.lon, bounds), surfaceY, latToZ(vector.lat, bounds)]} rotation-y={angle}>
      <mesh position-x={length / 2} rotation-z={-Math.PI / 2}>
        <cylinderGeometry args={[0.018, 0.018, length, 6]} />
        <meshBasicMaterial color="#b9f4ff" transparent opacity={opacity * 0.62} depthWrite={false} />
      </mesh>
      <mesh position-x={length} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[0.075, 0.2, 8]} />
        <meshBasicMaterial color="#e2fbff" transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshBasicMaterial color="#65d9ff" transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function CurrentVectors({ data, opacity = 0.9, field, filled, range, scaleType = "linear" }) {
  if (!data?.vectors || !field || !filled || !range) return null;
  return <group>
    {data.vectors.map((vector, index) => (
      <Glyph key={`${vector.lat}:${vector.lon}`} vector={vector} bounds={data.bounds} opacity={opacity} index={index} field={field} filled={filled} range={range} scaleType={scaleType} />
    ))}
    <Html position={[-8.2, 0.45, -5.7]} center distanceFactor={20} style={{ pointerEvents: "none" }}>
      <span className="scene-current-label">Surface currents · U/V · {data.units}</span>
    </Html>
  </group>;
}
