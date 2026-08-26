"""
Download Natural Earth land polygons for the Indian Ocean region.

Source: Natural Earth 1:10m physical land and minor islands (public domain),
via the natural-earth-vector GitHub mirror. This is REAL cartographic data -
nothing here is procedurally generated.

Land is stored as polygons rather than bare coastlines: the 2D map fills them
grey and strokes their outline, and the 3D scene extrudes them into solid
landmasses. Rings are clipped to the region rectangle so the extruded geometry
does not spike outside the ocean domain.

Output: frontend/public/land.json  (GeoJSON, served as a static asset)
"""

import json
import ssl
import urllib.request
from pathlib import Path

import certifi

# 1:10m is Natural Earth's highest-detail physical tier - needed for a
# recognisable Indian mainland silhouette and for the small island groups.
NE_BASE = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
    "master/geojson/"
)
SOURCES = [
    ("ne_10m_land.geojson", "land"),
    ("ne_10m_minor_islands.geojson", "minor islands"),
]

OUT = Path(__file__).parent.parent.parent / "frontend" / "public" / "land.json"

from region import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX  # noqa: E402

PAD = 0.5  # a hair outside the domain so coastal edges stay filled

# Natural Earth's minor-islands layer includes sub-kilometre rocks and reefs.
# Extruded into 3D they degenerate into thin vertical columns that read as
# stray black bars across the ocean, so drop anything below ~10 km2. Real
# island groups (Lakshadweep atolls, Andaman & Nicobar) stay well above this.
MIN_AREA_DEG2 = 0.0008

CLIP = (LON_MIN - PAD, LAT_MIN - PAD, LON_MAX + PAD, LAT_MAX + PAD)


def ring_intersects(ring) -> bool:
    """True if a ring's bounding box overlaps the clip region."""
    lons = [c[0] for c in ring]
    lats = [c[1] for c in ring]
    x0, y0, x1, y1 = CLIP
    return min(lons) <= x1 and max(lons) >= x0 and min(lats) <= y1 and max(lats) >= y0


def clip_ring(ring):
    """
    Sutherland-Hodgman clip of a polygon ring against the region rectangle.

    The 3D scene extrudes these rings into solid landmasses. Un-clipped rings
    run far outside the ocean domain and, once they wrap around the clip area,
    triangulate into visible spikes - so clip the geometry itself rather than
    relying on the renderer.
    """
    x0, y0, x1, y1 = CLIP

    def inside(p, edge):
        if edge == 0: return p[0] >= x0
        if edge == 1: return p[0] <= x1
        if edge == 2: return p[1] >= y0
        return p[1] <= y1

    def intersect(a, b, edge):
        ax, ay = a
        bx, by = b
        if edge in (0, 1):
            x = x0 if edge == 0 else x1
            t = (x - ax) / (bx - ax) if bx != ax else 0.0
            return [x, ay + t * (by - ay)]
        y = y0 if edge == 2 else y1
        t = (y - ay) / (by - ay) if by != ay else 0.0
        return [ax + t * (bx - ax), y]

    poly = [list(p[:2]) for p in ring]
    for edge in range(4):
        if not poly:
            return []
        out = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            cur_in = inside(cur, edge)
            prev_in = inside(prev, edge)
            if cur_in:
                if not prev_in:
                    out.append(intersect(prev, cur, edge))
                out.append(cur)
            elif prev_in:
                out.append(intersect(prev, cur, edge))
        poly = out
    return poly


def ring_area(ring) -> float:
    """Shoelace area in square degrees."""
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def trim(ring):
    """Round, and drop consecutive duplicate points (they break triangulation)."""
    out = []
    for c in ring:
        pt = [round(c[0], 3), round(c[1], 3)]
        if not out or pt != out[-1]:
            out.append(pt)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def main() -> None:
    ctx = ssl.create_default_context(cafile=certifi.where())

    features = []
    for filename, label in SOURCES:
        print(f"downloading Natural Earth 1:10m {label}...")
        try:
            with urllib.request.urlopen(NE_BASE + filename, timeout=240, context=ctx) as r:
                features.extend(json.load(r)["features"])
        except Exception as exc:  # noqa: BLE001
            print(f"  WARNING: {filename} unavailable ({exc})")

    polygons = []
    for feat in features:
        geom = feat.get("geometry") or {}
        if geom.get("type") == "Polygon":
            parts = [geom["coordinates"]]
        elif geom.get("type") == "MultiPolygon":
            parts = geom["coordinates"]
        else:
            continue
        for poly in parts:
            # poly[0] is the outer ring; the rest are holes (lakes).
            if not poly or not ring_intersects(poly[0]):
                continue
            outer = trim(clip_ring(poly[0]))
            if len(outer) < 3 or ring_area(outer) < MIN_AREA_DEG2:
                continue
            rings = [outer]
            for hole in poly[1:]:
                clipped = trim(clip_ring(hole))
                if len(clipped) >= 3:
                    rings.append(clipped)
            polygons.append(rings)

    out = {
        "type": "Feature",
        "properties": {
            "source": "Natural Earth 1:10m physical land + minor islands (public domain)",
            "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
        },
        "geometry": {"type": "MultiPolygon", "coordinates": polygons},
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out))
    pts = sum(len(r) for poly in polygons for r in poly)
    print(f"wrote {OUT}\n  {len(polygons)} polygons, {pts} points, {OUT.stat().st_size // 1024} KB")
    print(f"  (dropped features smaller than {MIN_AREA_DEG2} deg^2 - they extrude "
          f"into sliver columns rather than recognisable land)")


if __name__ == "__main__":
    main()
