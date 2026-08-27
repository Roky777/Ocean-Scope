# OceanScope

OceanScope is a browser-based 3D ocean intelligence prototype for SIH26067
(INCOIS). It combines depth-resolved model fields, real Argo observations,
animated currents, scientific 3D layers, and clearly labelled hazard-support
indicators for the India EEZ study region (5–25°N, 65–97°E).

## What works

- Temperature and salinity terrain across 5, 50, 100, 200, and 500 m.
- GPU ray-marched volume rendering for depth-resolved variables.
- Marching-tetrahedra isosurface extraction.
- Real current-speed fields and animated U/V direction glyphs.
- Real chlorophyll-a with a logarithmic colour scale by default.
- Time playback, depth transitions, vertical exaggeration, layer opacity,
  palette presets, linear/log scaling, and manual colour ranges.
- Real Argo markers and depth profiles, including model-versus-float comparison.
- Coordinate search with camera focus and removable map marker.
- Derived cyclone heat-potential and warm-anomaly hazard views.
- A baseline 1–3 month SST trend projection, visibly marked as predicted and
  non-operational.
- Forecaster and simplified Explore modes, Hazard Advisory, and data-source
  documentation in one responsive interface.

OceanScope does not generate random ocean fields. Temperature, salinity,
currents, chlorophyll, coastlines, and Argo observations come from the real
sources below. Forecast and hazard layers are derived from those fields and
are explicitly labelled as non-operational decision-support outputs.

## Real data sources

| Layer | Source | Coverage used by the default build |
|---|---|---|
| Temperature and salinity | [INCOIS ERDDAP `incois_argo_mnt_VAM`](https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.html) | Monthly gridded Argo analysis, Apr 2018–Mar 2019, five depths |
| Current U/V and speed | INCOIS ERDDAP `incois_valueadded_products_datasets` | Monthly geostrophic currents; surface only |
| Chlorophyll-a | INCOIS ERDDAP `incois_oceansat2_datasets` | Oceansat-2 OCM observations; surface only |
| Float positions and profiles | [Argo data served by INCOIS](https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.html) | Ten real floats with depth-resolved temperature/salinity profiles |
| Coastlines and islands | [Natural Earth 1:10m](https://www.naturalearthdata.com/) | Public-domain geometry clipped to the study region |

The default download path needs no API key. Copernicus support is optional;
`backend/data/download_copernicus.py` documents the free-account setup.

The 2018–2019 window is intentional: it is the most recent shared period in
which the selected INCOIS temperature, salinity, geostrophic-current, and
Oceansat-2 chlorophyll products overlap. Moving the temperature window later
can make older surface products unavailable; the app reports that state rather
than inventing replacement values.

## Run locally

Requirements: Python 3.10+ and Node.js 18+.

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

python data/download_incois.py
python data/download_currents.py
python data/download_chlorophyll.py
python data/fetch_argo.py
python data/prepare_geography.py

uvicorn app.main:app --reload --port 8000
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5180**. The Vite port is intentionally pinned; startup
fails instead of silently switching ports when 5180 is occupied. API docs are
available at **http://localhost:8000/docs**.

To stop either development server, focus its terminal and press `Ctrl+C`.

## Vercel deployment

The production frontend can run without a Python server. The fixed API snapshot
under `frontend/public/api-static/` is served from Vercel's CDN, while
`vercel.json` contains the install, build, output, SPA rewrite, and cache rules.

```bash
# Refresh the committed snapshot after changing source data or API responses
backend/venv/bin/python backend/data/export_static.py

# Verify the production frontend
cd frontend
npm ci
npm run build
```

Deploy the repository root to Vercel with no environment variables. In a
production build with no `VITE_API_BASE`, the frontend reads `/api-static`.

To use a separately deployed FastAPI service instead, set:

```text
VITE_API_BASE=https://your-api.example.com
```

and configure the backend CORS allow-list:

```bash
export ALLOWED_ORIGINS="https://your-app.vercel.app"
uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
```

The FastAPI/xarray service is not deployed as a Vercel serverless function.
Use a container host such as Render, Fly.io, Railway, or a VM when live,
changing data is required.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/meta` | Variables, availability, depths, times, bounds, ranges, and source metadata |
| `GET /api/field?variable=&depth=&timestep=` | Browser-sized 2D field slice |
| `GET /api/volume?variable=&timestep=` | Depth-resolved grid for ray marching |
| `GET /api/currents?timestep=&stride=` | Sparse real U/V current vectors |
| `GET /api/isosurface?variable=&timestep=&value=` | Marching-tetrahedra mesh |
| `GET /api/forecast?lead=` | Baseline SST trend projection for lead 1–3 |
| `GET /api/hazard?timestep=` | Derived heat-potential/anomaly fields and advisories |
| `GET /api/floats` | Real Argo positions and full profiles |
| `GET /api/health` | Backend health check |

Legacy `/api/slice` and `/api/sst` endpoints remain for the earlier prototype
views but are not the primary application pipeline.

## Architecture

```text
INCOIS / Argo / Natural Earth
              ↓
source adapters + xarray / NetCDF preprocessing
              ↓
FastAPI JSON fields, profiles, volumes, vectors and derived layers
              ↓
React + Three.js GPU rendering and interaction
```

Each additional gridded source is implemented as a small ingestion adapter.
`backend/data/_shared_ingest.py` handles fetching, monthly alignment, grid
interpolation, and attachment to the base NetCDF dataset. Add a new adapter,
declare its variable metadata in `backend/app/ocean.py`, and regenerate the
static snapshot to expose another sensor or product.

## Scientific and product boundaries

- The current and chlorophyll products are surface-only; depth controls do not
  pretend otherwise.
- Ray marching visualizes the available five-level model volume. It improves
  spatial interpretation but does not increase the source's vertical
  resolution.
- Isosurfaces use marching tetrahedra on the native depth/lat/lon grid.
- The forecast is a transparent baseline trend extrapolation, not an
  operational INCOIS forecast or cyclone prediction.
- Hazard zones are derived visualization aids, not official warnings.
- Current data has a long-tailed distribution; use manual colour limits when
  comparing typical flow rather than extremes.
- Natural Earth geometry is simplified for browser rendering while retaining
  important island groups in India's EEZ.

## Repository layout

```text
backend/app/          FastAPI endpoints and derived hazard logic
backend/data/         Real-data download, adapter, geography, and export scripts
frontend/src/scene/   Three.js terrain, volume, current, land, and isosurface layers
frontend/src/ui/      Navigation, controls, profiles, colourbar, and panels
frontend/src/views/   Explorer-adjacent Hazard and About views
frontend/public/      Coastline geometry and static API snapshot
vercel.json           Vercel build, routing, and cache configuration
```
