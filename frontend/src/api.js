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
  instruments: () => (LIVE ? `${LIVE}/api/instruments` : `${STATIC_ROOT}/floats.json`),
  hazard: (timestep) =>
    LIVE
      ? `${LIVE}/api/hazard?timestep=${timestep}`
      : `${STATIC_ROOT}/hazard/${timestep}.json`,
  field: (variable, depth, timestep) =>
    LIVE
      ? `${LIVE}/api/field?variable=${variable}&depth=${depth}&timestep=${timestep}`
      : `${STATIC_ROOT}/field/${variable}/${depth}/${timestep}.json`,
  volume: (variable, timestep) =>
    LIVE
      ? `${LIVE}/api/volume?variable=${variable}&timestep=${timestep}`
      : `${STATIC_ROOT}/volume/${variable}/${timestep}.json`,
  currents: (timestep) =>
    LIVE
      ? `${LIVE}/api/currents?timestep=${timestep}&stride=3`
      : `${STATIC_ROOT}/currents/${timestep}.json`,
  isosurface: (variable, timestep, value) => {
    const encoded = encodeURIComponent(Number(value).toFixed(2));
    return LIVE
      ? `${LIVE}/api/isosurface?variable=${variable}&timestep=${timestep}&value=${encoded}`
      : `${STATIC_ROOT}/isosurface/${variable}/${timestep}/${encoded}.json`;
  },
  forecast: (lead) =>
    LIVE ? `${LIVE}/api/forecast?lead=${lead}` : `${STATIC_ROOT}/forecast/${lead}.json`,
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
export const fetchInstruments = async () => {
  const data = await getJSON(url.instruments());
  const instruments = data.instruments ?? data.floats ?? [];
  return {
    ...data,
    instruments: instruments.map((item) => ({
      ...item,
      type: item.type ?? "argo",
      variables: item.variables ?? ["temperature", "salinity"],
    })),
  };
};

export async function uploadInstruments(file, instrumentType, columnMapping = {}) {
  if (!LIVE) throw new Error("Uploads require the live FastAPI service");
  const query = new URLSearchParams({
    instrument_type: instrumentType,
    filename: file.name,
    column_mapping: JSON.stringify(columnMapping),
  });
  const res = await fetch(`${LIVE}/api/import/instruments?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Import failed (${res.status})`);
  }
  return res.json();
}

export async function uploadDataset(file, activate = false) {
  if (!LIVE) throw new Error("Dataset imports require the live FastAPI service");
  const query = new URLSearchParams({ filename: file.name, activate: String(activate) });
  const res = await fetch(`${LIVE}/api/import/datasets?${query}`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Dataset import failed (${res.status})`);
  }
  return res.json();
}

const layerCache = new Map();
const cachedLayer = (key, path) => {
  if (!layerCache.has(key)) {
    layerCache.set(key, getJSON(path).catch((error) => {
      layerCache.delete(key);
      throw error;
    }));
  }
  return layerCache.get(key);
};

export const fetchVolume = (variable, timestep) =>
  cachedLayer(`volume|${variable}|${timestep}`, url.volume(variable, timestep));
export const fetchCurrents = (timestep) =>
  cachedLayer(`currents|${timestep}`, url.currents(timestep));
function extractIsosurface(volume, level) {
  const tets = [[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
  const edges = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const vertices = [];
  const [nz, ny, nx] = volume.shape;
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const p = [
      [volume.lon[i],volume.depths[k],volume.lat[j]],[volume.lon[i+1],volume.depths[k],volume.lat[j]],
      [volume.lon[i+1],volume.depths[k],volume.lat[j+1]],[volume.lon[i],volume.depths[k],volume.lat[j+1]],
      [volume.lon[i],volume.depths[k+1],volume.lat[j]],[volume.lon[i+1],volume.depths[k+1],volume.lat[j]],
      [volume.lon[i+1],volume.depths[k+1],volume.lat[j+1]],[volume.lon[i],volume.depths[k+1],volume.lat[j+1]],
    ];
    const v = [
      volume.values[k][j][i],volume.values[k][j][i+1],volume.values[k][j+1][i+1],volume.values[k][j+1][i],
      volume.values[k+1][j][i],volume.values[k+1][j][i+1],volume.values[k+1][j+1][i+1],volume.values[k+1][j+1][i],
    ];
    if (v.some((x) => x == null)) continue;
    for (const tet of tets) {
      const hits = [];
      for (const [ea, eb] of edges) {
        const a = tet[ea], b = tet[eb];
        if ((v[a] < level) === (v[b] < level) || v[a] === v[b]) continue;
        hits.push(lerp(p[a], p[b], (level - v[a]) / (v[b] - v[a])));
      }
      if (hits.length === 3) vertices.push(...hits);
      else if (hits.length === 4) vertices.push(hits[0],hits[1],hits[2],hits[0],hits[2],hits[3]);
    }
  }
  return {
    variable: volume.variable, value: level, units: volume.units,
    timestep: volume.timestep, month_label: volume.month_label,
    bounds: volume.bounds, depth_range: [volume.depths[0], volume.depths.at(-1)],
    triangle_count: vertices.length / 3, vertices,
    method: "Marching tetrahedra over the native INCOIS depth/lat/lon grid (client-side static build)",
  };
}

export const fetchIsosurface = (variable, timestep, value) => {
  const k = `iso|${variable}|${timestep}|${Number(value).toFixed(2)}`;
  if (LIVE) return cachedLayer(k, url.isosurface(variable, timestep, value));
  if (!layerCache.has(k)) layerCache.set(k, fetchVolume(variable, timestep).then((v) => extractIsosurface(v, value)));
  return layerCache.get(k);
};
export const fetchForecast = (lead) =>
  cachedLayer(`forecast|${lead}`, url.forecast(lead));

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
