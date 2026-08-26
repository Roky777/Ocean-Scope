"""
OceanScope prototype API.

Two endpoints:
  GET /api/slice?depth=<m>&timestep=<i>  -> downsampled temperature grid
  GET /api/floats                        -> Argo float positions

The NetCDF file is read once at startup with xarray and held in memory (it is
small). Swapping in a real INCOIS/Copernicus file only requires that it expose
the same dimension names: time, depth, lat, lon.
"""

import json
import os
from pathlib import Path

import numpy as np
import xarray as xr
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import hazard, ocean

DATA_DIR = Path(__file__).parent.parent / "data"
NC_PATH = DATA_DIR / "ocean_temp.nc"
FLOATS_PATH = DATA_DIR / "argo_floats.json"
SST_PATH = DATA_DIR / "indian_ocean_sst.nc"

VARIABLE = "temperature"
GRID_SIZE = 50       # downsample target for the 3D depth slices
SST_GRID_SIZE = 100  # downsample target for the 2D LAS-style map

app = FastAPI(title="OceanScope API", version="0.3.0")
# Local prototype: accept any localhost port so a shifted Vite dev port does
# not silently break the app. Tighten this to an explicit list before deploying.
app.add_middleware(
    CORSMiddleware,
    # Local dev is always allowed. Deployed frontends (e.g. a Vercel URL) are
    # added via ALLOWED_ORIGINS, a comma-separated list, so the browser is not
    # blocked by CORS when the API runs on a different host to the UI.
    allow_origins=[o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["GET"],
    allow_headers=["*"],
)

_ds: xr.Dataset | None = None
_global_range: tuple[float, float] = (0.0, 1.0)
_sst: xr.Dataset | None = None
_sst_global_range: tuple[float, float] = (0.0, 1.0)


app.include_router(ocean.router)
app.include_router(hazard.router)


@app.on_event("startup")
def load_data() -> None:
    global _ds, _global_range

    # The 3D scene's data (WOA23 + Argo profiles).
    ocean.load()

    # Legacy prototypes below; missing files must not stop the app booting.
    if not NC_PATH.exists():
        return
    _ds = xr.open_dataset(NC_PATH)
    var = _ds[VARIABLE]
    _global_range = (float(var.min()), float(var.max()))

    global _sst, _sst_global_range
    if SST_PATH.exists():
        _sst = xr.open_dataset(SST_PATH)
        sst = _sst["sst"]
        _sst_global_range = (float(sst.min()), float(sst.max()))


def _downsample(arr2d: np.ndarray, coords_lat, coords_lon, size: int = GRID_SIZE):
    """Stride the grid down to at most size x size points."""
    ny, nx = arr2d.shape
    yi = np.linspace(0, ny - 1, min(size, ny)).round().astype(int)
    xi = np.linspace(0, nx - 1, min(size, nx)).round().astype(int)
    return arr2d[np.ix_(yi, xi)], coords_lat[yi], coords_lon[xi]


def _to_json_grid(grid: np.ndarray):
    """Row-major nested lists; NaN (land / missing) becomes null."""
    return [
        [None if not np.isfinite(v) else round(float(v), 2) for v in row]
        for row in grid
    ]


@app.get("/api/slice")
def get_slice(
    depth: float = Query(0.0, ge=0.0, description="Depth in metres; nearest level is used"),
    timestep: int = Query(0, ge=0, description="Index into the time dimension"),
):
    if _ds is None:
        raise HTTPException(503, "dataset not loaded")

    depths = [float(d) for d in _ds["depth"].values]
    n_time = _ds.sizes["time"]
    if timestep >= n_time:
        raise HTTPException(400, f"timestep out of range (0..{n_time - 1})")

    # Snap to the nearest available depth level.
    actual_depth = min(depths, key=lambda d: abs(d - depth))

    sel = _ds[VARIABLE].isel(time=timestep).sel(depth=actual_depth)
    grid, lats, lons = _downsample(
        sel.values, _ds["lat"].values, _ds["lon"].values
    )

    # JSON has no NaN: land / missing cells become null.
    clean = [
        [None if not np.isfinite(v) else round(float(v), 2) for v in row]
        for row in grid
    ]
    finite = grid[np.isfinite(grid)]

    return {
        "variable": VARIABLE,
        "units": _ds[VARIABLE].attrs.get("units", "degC"),
        "depth": actual_depth,
        "depth_requested": depth,
        "depths_available": depths,
        "timestep": timestep,
        "timesteps_available": n_time,
        "time": str(_ds["time"].values[timestep])[:19],
        "bounds": {
            "lat_min": float(lats.min()), "lat_max": float(lats.max()),
            "lon_min": float(lons.min()), "lon_max": float(lons.max()),
        },
        "shape": [len(clean), len(clean[0])],
        "lat": [round(float(v), 4) for v in lats],
        "lon": [round(float(v), 4) for v in lons],
        # Row-major: values[i][j] is at lat[i], lon[j]
        "values": clean,
        "slice_range": {
            "min": round(float(finite.min()), 2) if finite.size else None,
            "max": round(float(finite.max()), 2) if finite.size else None,
        },
        # Stable colour scale across depths, so the plane's colours stay comparable.
        "global_range": {
            "min": round(_global_range[0], 2),
            "max": round(_global_range[1], 2),
        },
    }


@app.get("/api/floats")
def get_floats():
    if not FLOATS_PATH.exists():
        raise HTTPException(
            503, f"{FLOATS_PATH.name} not found. Run: python data/fetch_argo.py"
        )
    floats = json.loads(FLOATS_PATH.read_text())
    return {
        "count": len(floats),
        "source": "IFREMER ERDDAP ArgoFloats" if floats and floats[0].get("source") == "real"
                  else "synthetic placeholder",
        "floats": floats,
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "dataset": NC_PATH.name, "loaded": _ds is not None}


# --- 2D LAS-style reference map ------------------------------------------

def _sst_index():
    """[(year, month), ...] available in the SST file, in file order."""
    times = _sst["time"].values
    return [
        (int(str(t)[:4]), int(str(t)[5:7]))
        for t in times
    ]


@app.get("/api/sst")
def get_sst(
    year: int | None = Query(None, description="Calendar year; defaults to the first available"),
    month: int | None = Query(None, ge=1, le=12, description="Month 1-12"),
):
    if _sst is None:
        raise HTTPException(
            503,
            f"{SST_PATH.name} not found. Run: python data/download_sst.py",
        )

    index = _sst_index()
    if year is None or month is None:
        year, month = index[0]

    if (year, month) not in index:
        raise HTTPException(
            404,
            f"no data for {year}-{month:02d}; available: "
            f"{index[0][0]}-{index[0][1]:02d} .. {index[-1][0]}-{index[-1][1]:02d}",
        )

    ti = index.index((year, month))
    field = _sst["sst"].isel(time=ti)
    grid, lats, lons = _downsample(
        field.values, _sst["lat"].values, _sst["lon"].values, SST_GRID_SIZE
    )

    values = _to_json_grid(grid)
    finite = grid[np.isfinite(grid)]

    return {
        "variable": "sst",
        "variable_label": "Sea-surface temperature",
        "units": "degC",
        "year": year,
        "month": month,
        "shape": [len(values), len(values[0])],
        "bounds": {
            "lat_min": float(lats.min()), "lat_max": float(lats.max()),
            "lon_min": float(lons.min()), "lon_max": float(lons.max()),
        },
        "lat": [round(float(v), 4) for v in lats],
        "lon": [round(float(v), 4) for v in lons],
        # Row-major: values[i][j] is at lat[i], lon[j]. null = land / no data.
        "values": values,
        # Colorbar range for THIS month, as the LAS reference does.
        "range": {
            "min": round(float(finite.min()), 2) if finite.size else None,
            "max": round(float(finite.max()), 2) if finite.size else None,
        },
        # Range across every month, if you prefer a scale that is stable in time.
        "global_range": {
            "min": round(_sst_global_range[0], 2),
            "max": round(_sst_global_range[1], 2),
        },
        "available": [{"year": y, "month": m} for y, m in index],
    }
