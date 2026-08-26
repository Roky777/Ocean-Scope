import { useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { lonToX, latToZ, RELIEF, sampleNormalised } from "../grid";

const GLOW = new THREE.Color("#6fe3ff");

/**
 * Real Argo floats as glowing markers sitting on the terrain surface.
 * Hover shows ID + depth; clicking opens the profile panel.
 */
export default function FloatMarkers({ floats, field, filled, range, onSelect, selectedId }) {
  const [hovered, setHovered] = useState(null);
  if (!field || !filled) return null;

  const b = field.bounds;

  return floats.map((f) => {
    const inside =
      f.lat >= b.lat_min && f.lat <= b.lat_max && f.lon >= b.lon_min && f.lon <= b.lon_max;
    if (!inside) return null;

    const t = sampleNormalised(filled, f.lat, f.lon, field, range);
    const y = t * RELIEF + 0.22;

    // Three visually distinct states, not two: selected outranks hovered so the
    // marker whose panel is open stays obvious while you hover others.
    const isSelected = f.id === selectedId;
    const isHovered = f.id === hovered && !isSelected;
    const radius = isSelected ? 0.19 : isHovered ? 0.15 : 0.105;
    const emissive = isSelected ? 3.4 : isHovered ? 2.3 : 1.25;
    const haloScale = isSelected ? 0.36 : isHovered ? 0.29 : 0.2;
    const haloOpacity = isSelected ? 0.34 : isHovered ? 0.24 : 0.11;

    return (
      <group key={f.id} position={[lonToX(f.lon, b), y, latToZ(f.lat, b)]}>
        {/* Invisible pick target. The visible marker is only a few pixels wide
            on screen, which makes it fiddly to hover or click; this gives it a
            forgiving hit area without changing how it looks. */}
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(f.id);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered((h) => (h === f.id ? null : h));
            document.body.style.cursor = "auto";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(f);
          }}
        >
          <sphereGeometry args={[0.42, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <mesh>
          <sphereGeometry args={[radius, 20, 20]} />
          <meshStandardMaterial
            color={isSelected ? "#ffffff" : GLOW}
            emissive={GLOW}
            emissiveIntensity={emissive}
            toneMapped={false}
          />
        </mesh>

        {/* Soft halo so markers stay findable against bright terrain. */}
        <mesh>
          <sphereGeometry args={[haloScale, 16, 16]} />
          <meshBasicMaterial
            color={GLOW}
            transparent
            opacity={haloOpacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Selected marker gets a ring so it reads even against bright terrain. */}
        {isSelected && (
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.3, 0.36, 32]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* Tether down to the surface. */}
        <mesh position-y={-0.12}>
          <cylinderGeometry args={[0.012, 0.012, 0.24, 6]} />
          <meshBasicMaterial color={GLOW} transparent opacity={0.5} />
        </mesh>

        {(isHovered || isSelected) && (
          <Html
            center
            distanceFactor={14}
            zIndexRange={[20, 0]}
            /* The tooltip sits on top of the marker it describes, so its
               wrapper must not swallow the click that opens the panel. */
            style={{ pointerEvents: "none" }}
          >
            <div className="marker-tip">
              <strong>{f.id}</strong>
              <span>{f.max_depth} m profile</span>
            </div>
          </Html>
        )}
      </group>
    );
  });
}
