import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { latToZ, lonToX, RELIEF } from "../grid";

function Glyph({ vector, bounds, opacity, index, exaggeration }) {
  const pulse = useRef(null);
  const speed = Math.max(0.01, vector.speed);
  const length = Math.min(1.25, 0.35 + Math.sqrt(speed) * 0.45);
  const angle = Math.atan2(-vector.v, vector.u);
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const phase = (clock.elapsedTime * (0.45 + Math.min(speed, 1.5)) + index * 0.137) % 1;
    pulse.current.position.x = phase * length;
  });
  return (
    <group position={[lonToX(vector.lon, bounds), RELIEF * exaggeration + 0.38, latToZ(vector.lat, bounds)]} rotation-y={angle}>
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

export default function CurrentVectors({ data, opacity = 0.9, exaggeration = 1 }) {
  if (!data?.vectors) return null;
  return data.vectors.map((vector, index) => (
    <Glyph key={`${vector.lat}:${vector.lon}`} vector={vector} bounds={data.bounds} opacity={opacity} index={index} exaggeration={exaggeration} />
  ));
}
