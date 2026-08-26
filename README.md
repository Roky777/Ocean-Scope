# OceanScope — Prototype 0.4

3D ocean data visualization for SIH26067 (INCOIS). A colored, data-driven
terrain surface over the **India EEZ region** (5–25°N, 65–97°E), with real
coastlines, real Argo float markers, and depth / time / variable controls.

**Everything rendered is real, sourced data.** There is no procedural
generation, no Perlin/simplex noise, and no synthetic ocean data anywhere in
the active app.

## Data sources — all real, none require an account

| Layer | Source | Notes |
|---|---|---|
| **Ocean temperature + salinity** | [INCOIS ERDDAP](https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.html) — `incois_argo_mnt_VAM` | INCOIS's own gridded Argo product ("Variational Analysis Methodology"). Real monthly **time series** (not a climatology). 12 months (Aug 2025 – Jul 2026), 5 depth levels (5/50/100/200/500 m), 1° grid → 21×33 over this region. |
| **Argo float profiles** | [INCOIS ERDDAP](https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html) — `Indian_ARGO_Floats` | The archive behind INCOIS's Argo viewer. 10 real floats, each with a genuine profile cycle (~62 levels to ~988 m) carrying temperature and salinity. |
| **Coastlines / land** | [Natural Earth 1:10m](https://www.naturalearthdata.com/) physical land + minor islands | Public domain. Clipped to the region; features below ~10 km² dropped (see *Known trade-offs*). |

**No API keys or accounts are needed for any of the above.** The one script
that does need credentials is `download_copernicus.py`, which is optional and
not part of the default setup — its docstring lists the exact signup steps.

## Setup

Requires Python 3.10+ and Node 18+.

```bash
# 1. Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python data/download_incois.py       # ocean grid  -> data/indian_ocean.nc     (~5 s)
python data/fetch_argo.py            # float profiles -> data/argo_profiles.json
python data/prepare_geography.py     # coastlines  -> frontend/public/land.json

uvicorn app.main:app --reload --port 8000
```

```bash
# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5180**.

`region.py` is the single source of truth for the bounding box and depth
levels — the ocean grid and the coastline geometry both import it, so they can
never drift out of alignment.

## Deployment

Point Vercel at this repo and deploy — **no backend, no environment
variables, no dashboard configuration required.** Build settings live in
`vercel.json`.

This works because the backend serves a *fixed* NetCDF snapshot, so every
endpoint is deterministic. `backend/data/export_static.py` pre-renders the
entire API to `frontend/public/api-static/` (578 KB for 120 slices + floats +
meta), which is committed and served as plain static files.

| Mode | When | Data comes from |
|---|---|---|
| **Live** | `npm run dev`, or any build with `VITE_API_BASE` set | The FastAPI backend |
| **Static** | A production build with no `VITE_API_BASE` | `public/api-static/` |

Set `VITE_API_BASE` only if you *want* a live backend (e.g. to serve data that
changes). Otherwise leave it unset and the deploy is entirely self-contained.

**Re-run the exporter after changing the dataset or any response shape:**

```bash
backend/venv/bin/python backend/data/export_static.py
```

Stale slices are deleted on each run, so the snapshot can never drift out of
sync with the API's current shape.

### The backend does not run on Vercel

This is deliberate, not an oversight. The API is a long-lived process that
opens NetCDF files with xarray and holds the grids in memory. It does not fit
Vercel's Python serverless model:

- `xarray` + `netCDF4` + `numpy` + `pandas` are well over the serverless
  bundle limit once unzipped.
- The NetCDF files are build artifacts (gitignored, ~34 MB) — they are not in
  the repo and would have to be fetched on every cold start.
- Each invocation would re-open and re-read the dataset.

Deploy it to any container host instead (Render, Fly.io, Railway, a VM):

```bash
pip install -r backend/requirements.txt
python backend/data/download_incois.py        # fetch the NetCDF first
python backend/data/fetch_argo.py
export ALLOWED_ORIGINS="https://your-app.vercel.app"
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`ALLOWED_ORIGINS` is a comma-separated list added to the CORS allow-list.
Local dev origins are always permitted, so you only need it in production.

### Data is not in the repo

A fresh clone has no NetCDF files. Run the scripts in `backend/data/` (see
[Setup](#setup)) before starting the API, or every endpoint will 503 with a
message naming the script to run. The one exception is
`frontend/public/land.json`, which **is** committed — the deployed frontend
fetches it at runtime to draw the landmasses.

## How the terrain is built

For every lat/lon cell of the fetched grid, the value at the current
variable/depth/timestep sets **both** that vertex's height and its color:

```
t      = (value - range.min) / (range.max - range.min)
height = t * RELIEF
color  = colormap(t)            // sRGB -> linear for Three.js
```

See [`Terrain.jsx`](frontend/src/scene/Terrain.jsx). The color scale defaults
to the **currently loaded slice's** true min/max, so each month uses the whole
gradient; the Colorbar panel can widen it to "this depth" or "all" when you
want colors comparable across depth/time instead.

## API

| Endpoint | Description |
|---|---|
| `GET /api/meta` | Variables (with availability), depth levels, timesteps, bounds, precomputed ranges, source label. |
| `GET /api/field?variable=&depth=&timestep=` | One slice: `values` (row-major, `null` = land), `lat`, `lon`, `bounds`, `range` (this slice), `robust_*`, `empty`. ~21 KB. |
| `GET /api/floats` | 10 real Argo floats with full depth profiles. |

Interactive docs at http://localhost:8000/docs.

## Known trade-offs

- **Grid resolution.** INCOIS publishes this product on a 1° grid, so the
  region is 21×33 real samples. The renderer bilinearly upsamples ×4 for a
  smooth mesh — display interpolation only, exactly what any contouring package
  does. It creates no new data, and every number shown (colorbar, tooltips)
  comes from the native values. The on-screen source label always states the
  native grid size.
- **Dropped micro-islands.** Natural Earth's minor-islands layer includes
  sub-kilometre rocks. Extruded into 3D they degenerate into thin vertical
  columns, so features under ~0.0008 deg² (~10 km²) are filtered out. Sri
  Lanka, the Andaman & Nicobar chain and the larger Lakshadweep atolls are
  retained; the smallest Lakshadweep islets are not.
- **Current Speed** is deliberately greyed out with "Coming soon". INCOIS's
  gridded Argo product carries no currents, and the prototype never invents
  data for a variable it does not have.
- **Legacy prototypes** from earlier sessions live in `frontend/src/legacy/`
  (the 2D LAS-style map and the first Bay of Bengal scene). They are not
  imported by the app; delete when you no longer want them.

## Not built yet

True volumetric / ray-marched rendering · current vectors · isosurface
extraction · vertical exaggeration · log-scale and custom palettes ·
hazard / forecast layers.
