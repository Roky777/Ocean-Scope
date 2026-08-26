import { useMemo } from "react";
import * as THREE from "three";
import { lonToX, latToShapeY, RELIEF } from "../grid";

const LAND_TOP = RELIEF * 1.03; // just above the tallest ocean relief
const SKIRT = 0.42;              // visible thickness of the landmass

/**
 * Coastline landmasses as extruded geometry, shaded distinctly from the ocean
 * surface so the two read as different materials in the same scene.
 */
export default function Land({ land, bounds }) {
  const geometry = useMemo(() => {
    if (!land || !bounds) return null;

    const shapes = [];
    for (const poly of land.geometry.coordinates) {
      const [outer, ...holes] = poly;
      if (!outer || outer.length < 4) continue;

      const shape = new THREE.Shape(
        outer.map(([lon, lat]) => new THREE.Vector2(lonToX(lon, bounds), latToShapeY(lat, bounds))),
      );
      for (const ring of holes) {
        if (ring.length < 4) continue;
        shape.holes.push(
          new THREE.Path(
            ring.map(([lon, lat]) => new THREE.Vector2(lonToX(lon, bounds), latToShapeY(lat, bounds))),
          ),
        );
      }
      shapes.push(shape);
    }

    // A plateau with a short skirt, sitting entirely ABOVE the tallest ocean
    // relief. Extruding all the way to the sea floor makes the land side-walls
    // intersect the ocean surface, which z-fights into vertical streaks along
    // every coast.
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth: SKIRT,
      bevelEnabled: false,
      curveSegments: 1,
    });
    g.computeVertexNormals();
    return g;
  }, [land, bounds]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} position-y={LAND_TOP} castShadow>
      <meshStandardMaterial color="#6b7280" roughness={0.95} metalness={0.0} flatShading />
    </mesh>
  );
}
