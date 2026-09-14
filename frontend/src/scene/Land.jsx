import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { lonToX, latToShapeY } from "../grid";

const LAND_TOP = 0.14;
const SKIRT = 0.065;

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
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      curveSegments: 3,
    });
    g.computeVertexNormals();
    return g;
  }, [land, bounds]);

  const edges = useMemo(() => geometry ? new THREE.EdgesGeometry(geometry, 24) : null, [geometry]);
  useEffect(() => () => {
    geometry?.dispose();
    edges?.dispose();
  }, [geometry, edges]);
  if (!geometry || !edges) return null;
  return <group rotation-x={-Math.PI / 2} position-y={LAND_TOP}>
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#465044" roughness={0.94} metalness={0} />
    </mesh>
    <lineSegments geometry={edges}>
      <lineBasicMaterial color="#a7b49d" transparent opacity={0.3} />
    </lineSegments>
  </group>;
}
