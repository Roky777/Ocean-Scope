/** Shared world-space layout for the 3D scene, and grid helpers. */

// Domain box, in world units. Lat/lon map linearly into it (plate carree):
// approximate, not a real projection, which is fine at this scale.
export const WIDTH = 20;   // along X (longitude)
export const HEIGHT = 14;  // along Z (latitude)
export const RELIEF = 2.6; // vertical world units spanned by the full value range

export const lonToX = (lon, b) =>
  ((lon - b.lon_min) / (b.lon_max - b.lon_min) - 0.5) * WIDTH;

/** North maps to -Z, matching the terrain plane's local +Y after rotation. */
export const latToZ = (lat, b) =>
  -(((lat - b.lat_min) / (b.lat_max - b.lat_min)) - 0.5) * HEIGHT;

/** Shape coordinate for land polygons: +Y is north before the mesh rotates. */
export const latToShapeY = (lat, b) =>
  (((lat - b.lat_min) / (b.lat_max - b.lat_min)) - 0.5) * HEIGHT;

/**
 * Map a value into 0..1 for the colour ramp.
 *
 * `scale` may be "linear" or "log". Log is the convention for quantities that
 * span orders of magnitude (chlorophyll, and current speed, whose median here
 * is ~0.15 m/s against a tail past 5 m/s). Non-positive values are clamped to
 * a small epsilon so a log ramp never returns NaN.
 */
export function normalise(v, min, max, scale = "linear") {
  if (max === min) return 0.5;
  if (scale === "log") {
    const eps = 1e-4;
    const lo = Math.log(Math.max(min, eps));
    const hi = Math.log(Math.max(max, eps * 10));
    const x = Math.log(Math.max(v, eps));
    return hi === lo ? 0.5 : (x - lo) / (hi - lo);
  }
  return (v - min) / (max - min);
}

/** Inverse of `normalise`, for placing colorbar ticks. */
export function denormalise(t, min, max, scale = "linear") {
  if (scale === "log") {
    const eps = 1e-4;
    const lo = Math.log(Math.max(min, eps));
    const hi = Math.log(Math.max(max, eps * 10));
    return Math.exp(lo + t * (hi - lo));
  }
  return min + t * (max - min);
}

/**
 * Bleed values outward into null cells so the terrain surface stays continuous
 * under the coastline. Land is drawn as separate geometry on top, so these
 * filled cells are never actually visible - they just stop the mesh collapsing
 * to zero height at every coast.
 */
export function fillGaps(values, passes = 4) {
  const rows = values.length;
  const cols = values[0].length;
  let grid = values.map((row) => row.slice());

  for (let p = 0; p < passes; p++) {
    let changed = false;
    const next = grid.map((row) => row.slice());
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (grid[i][j] !== null) continue;
        let sum = 0;
        let n = 0;
        for (let di = -1; di <= 1; di++) {
          for (let dj = -1; dj <= 1; dj++) {
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= rows || b >= cols) continue;
            const v = grid[a][b];
            if (v !== null) {
              sum += v;
              n++;
            }
          }
        }
        if (n) {
          next[i][j] = sum / n;
          changed = true;
        }
      }
    }
    grid = next;
    if (!changed) break;
  }

  // Anything still null (fully enclosed) sits at the low end of the scale.
  const flat = grid.flat().filter((v) => v !== null);
  const fallback = flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
  return grid.map((row) => row.map((v) => (v === null ? fallback : v)));
}

/**
 * Normalised height (0..1) at a lat/lon, sampled from the filled grid with
 * nearest-neighbour lookup. Used to sit float markers on the surface.
 */
export function sampleNormalised(filled, lat, lon, field, range) {
  const b = field.bounds;
  const rows = filled.length;
  const cols = filled[0].length;
  const fi = ((lat - b.lat_min) / (b.lat_max - b.lat_min)) * (rows - 1);
  const fj = ((lon - b.lon_min) / (b.lon_max - b.lon_min)) * (cols - 1);
  const i = Math.min(rows - 1, Math.max(0, Math.round(fi)));
  const j = Math.min(cols - 1, Math.max(0, Math.round(fj)));
  return normalise(filled[i][j], range.min, range.max);
}

/**
 * Bilinear upsample for DISPLAY ONLY.
 *
 * The INCOIS analysis grid is 1 degree (21x33 over the India EEZ), which is
 * correct data but a very coarse mesh. This interpolates between real samples
 * so the surface shades smoothly - it creates no new information, exactly like
 * the interpolation any contouring package does before drawing. The colorbar
 * range and every reported number still come from the native values.
 */
export function upsample(grid, factor = 4) {
  if (factor <= 1) return grid;
  const rows = grid.length;
  const cols = grid[0].length;
  const outRows = (rows - 1) * factor + 1;
  const outCols = (cols - 1) * factor + 1;

  const out = new Array(outRows);
  for (let i = 0; i < outRows; i++) {
    const fi = i / factor;
    const i0 = Math.min(rows - 2, Math.floor(fi));
    const ti = fi - i0;
    const row = new Array(outCols);
    for (let j = 0; j < outCols; j++) {
      const fj = j / factor;
      const j0 = Math.min(cols - 2, Math.floor(fj));
      const tj = fj - j0;
      const a = grid[i0][j0];
      const b = grid[i0][j0 + 1];
      const c = grid[i0 + 1][j0];
      const d = grid[i0 + 1][j0 + 1];
      row[j] = a * (1 - ti) * (1 - tj) + b * (1 - ti) * tj + c * ti * (1 - tj) + d * ti * tj;
    }
    out[i] = row;
  }
  return out;
}


/** Inverse of lonToX / latToZ: world XZ back to geographic coordinates. */
export function worldToLatLon(x, z, b) {
  const lon = b.lon_min + (x / WIDTH + 0.5) * (b.lon_max - b.lon_min);
  const lat = b.lat_min + (0.5 - z / HEIGHT) * (b.lat_max - b.lat_min);
  return { lat, lon };
}

/**
 * Bilinearly interpolate a value from a slice's NATIVE grid at an arbitrary
 * lat/lon. Reported numbers therefore always come from the real samples, not
 * from the upsampled display mesh. Returns null over land / missing data.
 */
export function sampleValueAt(field, lat, lon) {
  const b = field.bounds;
  const rows = field.values.length;
  const cols = field.values[0].length;

  const fi = ((lat - b.lat_min) / (b.lat_max - b.lat_min)) * (rows - 1);
  const fj = ((lon - b.lon_min) / (b.lon_max - b.lon_min)) * (cols - 1);
  if (fi < 0 || fj < 0 || fi > rows - 1 || fj > cols - 1) return null;

  const i0 = Math.min(rows - 2, Math.floor(fi));
  const j0 = Math.min(cols - 2, Math.floor(fj));
  const ti = fi - i0;
  const tj = fj - j0;

  const q = [
    [field.values[i0][j0], (1 - ti) * (1 - tj)],
    [field.values[i0][j0 + 1], (1 - ti) * tj],
    [field.values[i0 + 1][j0], ti * (1 - tj)],
    [field.values[i0 + 1][j0 + 1], ti * tj],
  ];

  // Renormalise over whatever corners have data, so coastal cells still read.
  let sum = 0;
  let weight = 0;
  for (const [v, w] of q) {
    if (v === null) continue;
    sum += v * w;
    weight += w;
  }
  return weight > 0.001 ? sum / weight : null;
}

/** Great-circle distance in km. */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
