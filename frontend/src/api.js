/*
 * Two ways to reach the data:
 *
 *   LIVE   - a running FastAPI backend. Used in dev, or in production when
 *            VITE_API_BASE names a deployed API.
 *   STATIC - a pre-rendered snapshot of every endpoint, committed under
 *            public/api-static/ by backend/data/export_static.py.
 *
 * The backend serves a fixed NetCDF snapshot, so its responses are
 * deterministic and the static build is byte-for-byte the same data. This is
 * what lets the Vercel deployment run with no backend host at all: without
 * VITE_API_BASE, a production build reads the snapshot.
 */
const LIVE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : null);

const STATIC_ROOT = "/api-static";

export const usingStaticData = LIVE === null;

const url = {
  meta: () => (LIVE ? `${LIVE}/api/meta` : `${STATIC_ROOT}/meta.json`),
  floats: () => (LIVE ? `${LIVE}/api/floats` : `${STATIC_ROOT}/floats.json`),
  hazard: (timestep) =>
    LIVE
      ? `${LIVE}/api/hazard?timestep=${timestep}`
      : `${STATIC_ROOT}/hazard/${timestep}.json`,
  field: (variable, depth, timestep) =>
    LIVE
      ? `${LIVE}/api/field?variable=${variable}&depth=${depth}&timestep=${timestep}`
      : `${STATIC_ROOT}/field/${variable}/${depth}/${timestep}.json`,
};

async function getJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const fetchMeta = () => getJSON(url.meta());
export const fetchFloats = () => getJSON(url.floats());

// Slices are immutable, so cache them. Time playback re-visits the same
// timesteps constantly and this keeps playback from re-fetching every loop.
const cache = new Map();          // key -> Promise
const resolved = new Map();       // key -> payload (for synchronous reads)
const key = (variable, depth, timestep) => `${variable}|${depth}|${timestep}`;

export function fetchField(variable, depth, timestep) {
  const k = key(variable, depth, timestep);
  if (cache.has(k)) return cache.get(k);
  const p = getJSON(url.field(variable, depth, timestep))
    .then((d) => {
      resolved.set(k, d);
      return d;
    })
    .catch((e) => {
      cache.delete(k); // don't cache failures
      throw e;
    });
  cache.set(k, p);
  return p;
}

/**
 * Synchronous read of an already-fetched slice, or undefined.
 * Lets the point-inspection panel assemble a full depth profile with no
 * network round-trip at click time.
 */
export const getCachedField = (variable, depth, timestep) =>
  resolved.get(key(variable, depth, timestep));

/** Warm the cache for every timestep of the current variable/depth. */
export function prefetchTimesteps(variable, depth, count) {
  for (let t = 0; t < count; t++) {
    fetchField(variable, depth, t).catch(() => {});
  }
}

/** Warm every depth at the current variable/timestep, for instant profiles. */
export function prefetchDepths(variable, depths, timestep) {
  for (const d of depths) {
    fetchField(variable, d, timestep).catch(() => {});
  }
}

/** Land polygons (static asset served by Vite, not the API). */
export async function fetchLand() {
  const res = await fetch("/land.json");
  if (!res.ok) throw new Error(`land.json: ${res.status}`);
  return res.json();
}

// Hazard grids are as immutable as field slices, so cache them the same way.
const hazardCache = new Map();

export function fetchHazard(timestep) {
  if (hazardCache.has(timestep)) return hazardCache.get(timestep);
  const p = getJSON(url.hazard(timestep)).catch((e) => {
    hazardCache.delete(timestep);
    throw e;
  });
  hazardCache.set(timestep, p);
  return p;
}
