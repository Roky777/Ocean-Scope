import { useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { lonToX, latToZ, RELIEF, sampleNormalised } from "../grid";

const TYPE_COLORS = { argo: "#6fe3ff", glider: "#ffb547", ctd: "#c88cff", bgc: "#65ed8d" };

/**
 * Observation platforms as precise coordinate nodes sitting on the surface.
 * Hover shows ID + depth; clicking opens the profile panel.
 */
export default function FloatMarkers({ floats, field, filled, range, onSelect, selectedId, exaggeration = 1 }) {
  const [hovered, setHovered] = useState(null);
  if (!field || !filled) return null;

  const b = field.bounds;

  return floats.map((f) => {
    const type = f.type ?? "argo";
    const glow = new THREE.Color(TYPE_COLORS[type] ?? TYPE_COLORS.argo);
    const inside =
      f.lat >= b.lat_min && f.lat <= b.lat_max && f.lon >= b.lon_min && f.lon <= b.lon_max;
    if (!inside) return null;

    const t = sampleNormalised(filled, f.lat, f.lon, field, range);
    const y = t * RELIEF * exaggeration + 0.22;

    // Three visually distinct states, not two: selected outranks hovered so the
    // marker whose panel is open stays obvious while you hover others.
    const isSelected = f.id === selectedId;
    const isHovered = f.id === hovered && !isSelected;
    const radius = isSelected ? 0.15 : isHovered ? 0.13 : 0.1;

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

        <mesh position-y={0.055} rotation={type === "glider" ? [0, 0, Math.PI] : [0, 0, 0]}>
          {type === "glider" ? <coneGeometry args={[radius * 1.25, radius * 2.2, 3]} />
            : type === "ctd" ? <boxGeometry args={[radius * 1.7, radius * 1.7, radius * 1.7]} />
              : type === "bgc" ? <dodecahedronGeometry args={[radius * 1.15, 0]} />
                : <sphereGeometry args={[radius, 20, 20]} />}
          <meshStandardMaterial
            color={isSelected ? "#ffffff" : glow}
            emissive={glow}
            emissiveIntensity={isSelected ? 1.4 : isHovered ? 0.9 : 0.45}
            roughness={0.3}
            metalness={0.2}
            toneMapped={false}
          />
        </mesh>

        {/* A thin survey ring reads as a coordinate, not a decorative orb. */}
        <mesh rotation-x={-Math.PI / 2} position-y={-0.025}>
          <ringGeometry args={[isHovered || isSelected ? 0.23 : 0.18, isHovered || isSelected ? 0.255 : 0.198, 40]} />
          <meshBasicMaterial
            color={glow}
            transparent
            opacity={isSelected ? 0.95 : isHovered ? 0.8 : 0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Selected marker gets a ring so it reads even against bright terrain. */}
        {isSelected && (
          <mesh rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.29, 0.305, 40]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* Tether down to the surface. */}
        <mesh position-y={-0.105}>
          <cylinderGeometry args={[0.008, 0.008, 0.21, 8]} />
          <meshBasicMaterial color={glow} transparent opacity={0.72} />
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
              <span>{type.toUpperCase()} · {f.max_depth} m profile</span>
            </div>
          </Html>
        )}
      </group>
    );
  });
}
