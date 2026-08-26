"""
OceanScope 3D API.

Serves depth/time slices of the INCOIS gridded Argo dataset as small JSON
grids, plus real Argo float profiles. Raw NetCDF is never sent to the browser.

Endpoints:
    GET /api/meta                                     variables, depths, timesteps
    GET /api/field?variable=&depth=&timestep=         one downsampled grid
    GET /api/floats                                   Argo positions + profiles
"""

import json
from pathlib import Path

import numpy as np
import xarray as xr
from fastapi import APIRouter, HTTPException, Query

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_PATH = DATA_DIR / "indian_ocean.nc"
PROFILES_PATH = DATA_DIR / "argo_profiles.json"

# Cap on what we ship to the browser. The INCOIS grid is 50x71, already well
# under this, so slices go out at full native resolution.
GRID_LAT, GRID_LON = 120, 160

# The colorbar shows the TRUE min/max of the data actually loaded. (Robust
# percentiles are also returned: they mattered when the region included the
# shallow Persian Gulf, where the INCOIS analysis has a few extreme cells that
# Argo cannot constrain. The India EEZ region excludes it, so true extremes are
# safe to display and are what the UI uses.)
ROBUST_LO, ROBUST_HI = 0.5, 99.5

MONTH_ABBR = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

# Variables the UI offers. `available` drives the greyed-out "coming soon"
# options: we never serve invented data for a variable we do not have.
VARIABLES = {
    "temperature": {
        "id": "temperature",
        "label": "Temperature",
        "units": "°C",
        "colormap": "thermal",
        "available": True,
    },
    "salinity": {
        "id": "salinity",
        "label": "Salinity",
        "units": "PSU",
        "colormap": "haline",
        "available": True,
    },
    # Surface-only variables. `surface` tells the UI that the depth control
    # does not apply, rather than silently ignoring the depth it is given.
    "current_speed": {
        "id": "current_speed",
        "label": "Current Speed",
        "units": "m/s",
        "colormap": "speed",
        "available": True,
        "surface": True,
        "scale": "linear",
        "note": "INCOIS geostrophic currents; surface only, coverage ends 2019-03",
    },
    "chlorophyll": {
        "id": "chlorophyll",
        "label": "Chlorophyll-a",
        "units": "mg/m³",
        "colormap": "algae",
        "available": True,
        "surface": True,
        # Chlorophyll spans orders of magnitude, so a log ramp is the
        # conventional default for it.
        "scale": "log",
        "note": "Oceansat-2 OCM; surface only, coverage 2011-02 to 2020-05",
    },
}


def _is_surface(spec: dict) -> bool:
    return bool(spec.get("surface"))

router = APIRouter()

_ds: xr.Dataset | None = None
_ranges: dict[str, dict] = {}
_profiles: list | None = None


def load() -> None:
    """Open the dataset once at startup and precompute colour ranges."""
    global _ds, _profiles

    if DATA_PATH.exists():
        _ds = xr.open_dataset(DATA_PATH)
        for name in VARIABLES:
            if name not in _ds:
                continue
            var = _ds[name]
            if "depth" in var.dims:
                _ranges[name] = {
                    "global": _minmax(var.values),
                    # Per-depth ranges: the colorbar retargets on depth change.
                    "by_depth": {
                        float(d): _minmax(var.isel(depth=i).values)
                        for i, d in enumerate(_ds["depth"].values)
                    },
                }
            else:
                g = _minmax(var.values)
                _ranges[name] = {
                    "global": g,
                    "by_depth": {float(d): g for d in _ds["depth"].values},
                }

    if PROFILES_PATH.exists():
        _profiles = json.loads(PROFILES_PATH.read_text())


def _minmax(arr: np.ndarray) -> dict:
    """Robust colour range, plus the true extremes for reference."""
    finite = arr[np.isfinite(arr)]
    if not finite.size:
        return {"min": None, "max": None, "robust_min": None, "robust_max": None}
    return {
        "min": round(float(finite.min()), 2),
        "max": round(float(finite.max()), 2),
        "robust_min": round(float(np.percentile(finite, ROBUST_LO)), 2),
        "robust_max": round(float(np.percentile(finite, ROBUST_HI)), 2),
    }


def _timestep_label(t) -> dict:
    """'2026-07-15' -> {'label': 'Jul 2026', 'month': 7, 'year': 2026}."""
    text = str(t)
    year, month = int(text[:4]), int(text[5:7])
    return {"label": f"{MONTH_ABBR[month - 1]} {year}", "month": month, "year": year}


def _require_dataset() -> xr.Dataset:
    if _ds is None:
        raise HTTPException(
            503,
            f"{DATA_PATH.name} not found. Run: python data/download_incois.py",
        )
    return _ds


def _downsample(arr2d, lats, lons):
    ny, nx = arr2d.shape
    yi = np.linspace(0, ny - 1, min(GRID_LAT, ny)).round().astype(int)
    xi = np.linspace(0, nx - 1, min(GRID_LON, nx)).round().astype(int)
    return arr2d[np.ix_(yi, xi)], lats[yi], lons[xi]


@router.get("/api/meta")
def get_meta():
    """Everything the UI needs to build its controls before the first frame."""
    ds = _require_dataset()
    depths = [float(d) for d in ds["depth"].values]

    return {
        "region": "Indian Ocean",
        "variables": [
            {**spec, "available": spec["id"] in ds}
            for spec in VARIABLES.values()
        ],
        "default_variable": "temperature",
        "depths": depths,
        "timesteps": [
            {"index": i, **_timestep_label(t)}
            for i, t in enumerate(ds["time"].values)
        ],
        # Most recent available step, which is what the scene shows on load.
        "default_timestep": ds.sizes["time"] - 1,
        "bounds": {
            "lat_min": float(ds["lat"].min()), "lat_max": float(ds["lat"].max()),
            "lon_min": float(ds["lon"].min()), "lon_max": float(ds["lon"].max()),
        },
        "ranges": _ranges,
        "source": ds.attrs.get("source", ""),
        "source_label": "INCOIS ERDDAP · incois_argo_mnt_VAM (gridded Argo) + Argo GDAC floats",
        "source_url": ds.attrs.get("source_url", ""),
        "native_shape": [int(ds.sizes["lat"]), int(ds.sizes["lon"])],
    }


@router.get("/api/field")
def get_field(
    variable: str = Query("temperature"),
    depth: float | None = Query(None, ge=0.0, description="Defaults to the shallowest level"),
    timestep: int = Query(0, ge=0),
):
    ds = _require_dataset()

    spec = VARIABLES.get(variable)
    if spec is None:
        raise HTTPException(404, f"unknown variable '{variable}'")
    if variable not in ds:
        raise HTTPException(
            404,
            f"{spec['label']} is not in this dataset — "
            f"{spec.get('note', 'no data source wired up')}",
        )

    depths = [float(d) for d in ds["depth"].values]
    surface = _is_surface(spec)

    if surface:
        # No depth dimension: the depth control does not apply and any value
        # passed in is reported back as the surface level rather than honoured.
        depth = depths[0]
    else:
        if depth is None:
            depth = depths[0]
        if depth not in depths:
            raise HTTPException(
                404,
                f"No data at {depth:g} m — available depths: "
                + ", ".join(f"{d:g} m" for d in depths),
            )

    n_time = ds.sizes["time"]
    if timestep >= n_time:
        raise HTTPException(404, f"No data for timestep {timestep} (0..{n_time - 1})")

    if surface:
        field = ds[variable].isel(time=timestep)
    else:
        field = ds[variable].isel(time=timestep, depth=depths.index(depth))
    grid, lats, lons = _downsample(field.values, ds["lat"].values, ds["lon"].values)

    finite = grid[np.isfinite(grid)]
    stamp = _timestep_label(ds["time"].values[timestep])

    return {
        "variable": variable,
        "label": spec["label"],
        "units": spec["units"],
        "colormap": spec["colormap"],
        "surface": surface,
        "scale": spec.get("scale", "linear"),
        "depth": depth,
        "timestep": timestep,
        "month": stamp["month"],
        "month_label": stamp["label"],
        "shape": [grid.shape[0], grid.shape[1]],
        "bounds": {
            "lat_min": float(lats.min()), "lat_max": float(lats.max()),
            "lon_min": float(lons.min()), "lon_max": float(lons.max()),
        },
        "lat": [round(float(v), 3) for v in lats],
        "lon": [round(float(v), 3) for v in lons],
        # Row-major: values[i][j] at lat[i], lon[j]. null = land or no data.
        "values": [
            [None if not np.isfinite(v) else round(float(v), 2) for v in row]
            for row in grid
        ],
        # True when the whole slice is land/missing — the UI toasts instead of
        # rendering an empty scene.
        "empty": bool(finite.size == 0),
        "range": _minmax(grid),
        "depth_range": _ranges.get(variable, {}).get("by_depth", {}).get(depth),
        "global_range": _ranges.get(variable, {}).get("global"),
    }


@router.get("/api/floats")
def get_floats():
    if _profiles is None:
        raise HTTPException(
            503,
            f"{PROFILES_PATH.name} not found. Run: python data/fetch_argo.py",
        )
    return {
        "count": len(_profiles),
        "source": "IFREMER ERDDAP ArgoFloats (real Argo Program data)",
        "floats": _profiles,
    }
