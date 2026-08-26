const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`);
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

export const fetchMeta = () => getJSON("/api/meta");
export const fetchFloats = () => getJSON("/api/floats");

// Slices are immutable, so cache them. Time playback re-visits the same
// timesteps constantly and this keeps playback from re-fetching every loop.
const cache = new Map();          // key -> Promise
const resolved = new Map();       // key -> payload (for synchronous reads)
const key = (variable, depth, timestep) => `${variable}|${depth}|${timestep}`;

export function fetchField(variable, depth, timestep) {
  const k = key(variable, depth, timestep);
  if (cache.has(k)) return cache.get(k);
  const p = getJSON(
    `/api/field?variable=${variable}&depth=${depth}&timestep=${timestep}`,
  )
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
