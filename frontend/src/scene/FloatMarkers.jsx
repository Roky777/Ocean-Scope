import { useState } from "react";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { sample } from "../colormaps";
import { lonToX, latToZ, normalise, RELIEF, sampleNormalised } from "../grid";
import { VOLUME_DEPTH } from "./VolumeRenderer";

const TYPE_COLORS = { argo: "#d7d9dc", glider: "#b9bcc0", ctd: "#92969b", bgc: "#eceeef" };

/**
 * Observation platforms as precise coordinate nodes sitting on the surface.
 * Hover shows ID + depth; clicking opens the profile panel.
 */
export default function FloatMarkers({
  floats,
  field,
  filled,
  range,
  onSelect,
  selectedId,
  exaggeration = 1,
  colormap,
  scaleType = "linear",
  modelDepths = [],
  evidenceCandidates = [],
}) {
  const [hovered, setHovered] = useState(null);
  if (!field || !filled) return null;

  const b = field.bounds;
  const evidenceById = new Map(evidenceCandidates.map((item) => [item.id, item]));

  return floats.map((f) => {
    const type = f.type ?? "argo";
    const evidence = evidenceById.get(f.id);
    const matchColor = evidence ? (evidence.match_score >= 0.72 ? "#65ed8d" : evidence.match_score >= 0.5 ? "#ffd166" : "#9ba3ae") : null;
    const glow = new THREE.Color(matchColor ?? TYPE_COLORS[type] ?? TYPE_COLORS.argo);
    const inside =
      f.lat >= b.lat_min && f.lat <= b.lat_max && f.lon >= b.lon_min && f.lon <= b.lon_max;
    if (!inside) return null;

    const valuePosition = sampleNormalised(filled, f.lat, f.lon, field, range, scaleType);
    const softened = valuePosition * valuePosition * (3 - 2 * valuePosition);
    const y = RELIEF * 0.22 * (2 * softened - 1) + 0.22;

    // Three visually distinct states, not two: selected outranks hovered so the
    // marker whose panel is open stays obvious while you hover others.
    const isSelected = f.id === selectedId;
    const isHovered = f.id === hovered && !isSelected;
    const radius = isSelected ? 0.15 : isHovered ? 0.13 : 0.1;
    const modelMaxDepth = modelDepths.at(-1);
    const observedDepth = modelMaxDepth ? Math.min(f.max_depth ?? 0, modelMaxDepth) : 0;
    const profileHeight = modelMaxDepth ? (observedDepth / modelMaxDepth) * VOLUME_DEPTH * exaggeration : 0;
    const profile = isSelected && modelMaxDepth
      ? (f.profile ?? []).filter((point) => point.depth <= modelMaxDepth && Number.isFinite(point[field.variable]))
      : [];
    const profileStep = Math.max(1, Math.ceil(profile.length / 72));

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
            emissiveIntensity={isSelected ? 1.15 : isHovered ? 0.55 : 0.12}
            roughness={0.48}
            metalness={0.08}
            transparent
            opacity={isSelected ? 1 : isHovered ? .9 : .66}
            toneMapped={false}
          />
        </mesh>

        {/* A thin survey ring reads as a coordinate, not a decorative orb. */}
        <mesh rotation-x={-Math.PI / 2} position-y={-0.025}>
          <ringGeometry args={[isHovered || isSelected ? 0.23 : 0.18, isHovered || isSelected ? 0.255 : 0.198, 40]} />
          <meshBasicMaterial
            color={glow}
            transparent
            opacity={isSelected ? 0.95 : isHovered ? 0.7 : 0.28}
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

        {profileHeight > 0 && (
          <>
            <mesh position-y={-profileHeight / 2 - 0.22}>
              <cylinderGeometry args={[isSelected ? 0.014 : 0.008, isSelected ? 0.014 : 0.008, profileHeight, 6]} />
              <meshBasicMaterial color={isSelected ? "#ffffff" : glow} transparent opacity={isSelected ? 0.72 : 0.25} depthWrite={false} />
            </mesh>
            <mesh position-y={-profileHeight - 0.22} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.045, 0.075, 18]} />
              <meshBasicMaterial color={glow} transparent opacity={isSelected ? 0.95 : 0.42} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </>
        )}

        {profile.filter((_, index) => index % profileStep === 0).map((point, index) => {
          const t = Math.min(1, Math.max(0, normalise(point[field.variable], range.min, range.max, scaleType)));
          const [r, g, b] = sample(colormap, t);
          return (
            <mesh key={`${point.depth}:${index}`} position-y={-0.22 - (point.depth / modelMaxDepth) * VOLUME_DEPTH * exaggeration} renderOrder={6}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshBasicMaterial color={new THREE.Color(r, g, b)} toneMapped={false} depthWrite={false} />
            </mesh>
          );
        })}

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
              <span>{type.toUpperCase()} · {f.max_depth} m profile · {evidence ? `${Math.round(evidence.match_score * 100)}/100 match quality` : f.time ?? "time unavailable"}</span>
            </div>
          </Html>
        )}
      </group>
    );
  });
}
