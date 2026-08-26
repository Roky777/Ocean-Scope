"""
OceanScope 3D API.

Serves depth/time slices of the INCOIS gridded Argo dataset as small JSON
grids, plus real Argo float profiles. Raw NetCDF is never sent to the browser.

Endpoints:
    GET /api/meta                                     variables, depths, timesteps
    GET /api/field?variable=&depth=&timestep=         one downsampled grid
    GET /api/volume?variable=&timestep=               depth-resolved 3D grid
    GET /api/currents?timestep=&stride=               sparse vector field
    GET /api/isosurface?variable=&timestep=&value=    marching-tetrahedra mesh
    GET /api/forecast?lead=                           baseline SST forecast
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


def _clean(values: np.ndarray, digits: int = 3):
    """JSON-safe nested lists; NaN/Inf becomes null."""
    rounded = np.round(values, digits)
    safe = rounded.astype(object)
    safe[~np.isfinite(values)] = None
    return safe.tolist()


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


@router.get("/api/volume")
def get_volume(
    variable: str = Query("temperature"),
    timestep: int = Query(0, ge=0),
):
    """A compact depth×lat×lon volume for client-side GPU ray marching."""
    ds = _require_dataset()
    spec = VARIABLES.get(variable)
    if spec is None or variable not in ds:
        raise HTTPException(404, f"unknown or unavailable variable '{variable}'")
    if "depth" not in ds[variable].dims:
        raise HTTPException(400, f"{spec['label']} is surface-only and has no 3D volume")
    if timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {timestep}")

    values = np.asarray(ds[variable].isel(time=timestep).values, dtype="float32")
    stamp = _timestep_label(ds["time"].values[timestep])
    return {
        "variable": variable,
        "label": spec["label"],
        "units": spec["units"],
        "colormap": spec["colormap"],
        "scale": spec.get("scale", "linear"),
        "timestep": timestep,
        "month_label": stamp["label"],
        "shape": list(values.shape),
        "depths": [float(v) for v in ds["depth"].values],
        "lat": [round(float(v), 3) for v in ds["lat"].values],
        "lon": [round(float(v), 3) for v in ds["lon"].values],
        "bounds": get_meta()["bounds"],
        "values": _clean(values, 3),
        "range": _minmax(values),
    }


@router.get("/api/currents")
def get_currents(
    timestep: int = Query(0, ge=0),
    stride: int = Query(3, ge=1, le=12),
):
    """Sparse real INCOIS geostrophic vectors for animated glyph rendering."""
    ds = _require_dataset()
    if "current_u" not in ds or "current_v" not in ds:
        raise HTTPException(
            503,
            "Directional current components are not installed. Run data/download_currents.py.",
        )
    if timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {timestep}")

    u = np.asarray(ds["current_u"].isel(time=timestep).values, dtype=float)
    v = np.asarray(ds["current_v"].isel(time=timestep).values, dtype=float)
    lats = np.asarray(ds["lat"].values)
    lons = np.asarray(ds["lon"].values)
    vectors = []
    for j in range(0, len(lats), stride):
        for i in range(0, len(lons), stride):
            if not (np.isfinite(u[j, i]) and np.isfinite(v[j, i])):
                continue
            vectors.append({
                "lat": round(float(lats[j]), 3),
                "lon": round(float(lons[i]), 3),
                "u": round(float(u[j, i]), 4),
                "v": round(float(v[j, i]), 4),
                "speed": round(float(np.hypot(u[j, i], v[j, i])), 4),
            })
    return {
        "timestep": timestep,
        "month_label": _timestep_label(ds["time"].values[timestep])["label"],
        "units": "m/s",
        "stride": stride,
        "bounds": get_meta()["bounds"],
        "vectors": vectors,
        "source": ds["current_u"].attrs.get("source", "INCOIS geostrophic currents"),
    }


# Six tetrahedra tile a cube without ambiguity. This is marching tetrahedra,
# a real isosurface extractor (not a highlighted 2D contour).
_TETS = ((0, 5, 1, 6), (0, 1, 2, 6), (0, 2, 3, 6),
         (0, 3, 7, 6), (0, 7, 4, 6), (0, 4, 5, 6))
_TET_EDGES = ((0, 1), (0, 2), (0, 3), (1, 2), (1, 3), (2, 3))


def _tet_triangles(points, values, level):
    hits = []
    for a, b in _TET_EDGES:
        va, vb = values[a], values[b]
        if (va < level) == (vb < level) or va == vb:
            continue
        t = (level - va) / (vb - va)
        hits.append(points[a] + t * (points[b] - points[a]))
    if len(hits) == 3:
        return [(hits[0], hits[1], hits[2])]
    if len(hits) == 4:
        return [(hits[0], hits[1], hits[2]), (hits[0], hits[2], hits[3])]
    return []


@router.get("/api/isosurface")
def get_isosurface(
    variable: str = Query("temperature"),
    timestep: int = Query(0, ge=0),
    value: float = Query(...),
):
    """Extract a true 3D constant-value surface from the sampled water column."""
    ds = _require_dataset()
    if variable not in ds or "depth" not in ds[variable].dims:
        raise HTTPException(400, f"{variable} has no depth-resolved volume")
    if timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {timestep}")

    data = np.asarray(ds[variable].isel(time=timestep).values, dtype=float)
    depths = np.asarray(ds["depth"].values, dtype=float)
    lats = np.asarray(ds["lat"].values, dtype=float)
    lons = np.asarray(ds["lon"].values, dtype=float)
    triangles = []
    for k in range(len(depths) - 1):
        for j in range(len(lats) - 1):
            for i in range(len(lons) - 1):
                corners = np.array([
                    [lons[i], depths[k], lats[j]], [lons[i + 1], depths[k], lats[j]],
                    [lons[i + 1], depths[k], lats[j + 1]], [lons[i], depths[k], lats[j + 1]],
                    [lons[i], depths[k + 1], lats[j]], [lons[i + 1], depths[k + 1], lats[j]],
                    [lons[i + 1], depths[k + 1], lats[j + 1]], [lons[i], depths[k + 1], lats[j + 1]],
                ], dtype=float)
                vals = np.array([
                    data[k, j, i], data[k, j, i + 1], data[k, j + 1, i + 1], data[k, j + 1, i],
                    data[k + 1, j, i], data[k + 1, j, i + 1], data[k + 1, j + 1, i + 1], data[k + 1, j + 1, i],
                ])
                if not np.all(np.isfinite(vals)) or value < vals.min() or value > vals.max():
                    continue
                for tet in _TETS:
                    p = corners[list(tet)]
                    v = vals[list(tet)]
                    triangles.extend(_tet_triangles(p, v, value))

    vertices = [
        [round(float(c), 4) for c in vertex]
        for tri in triangles for vertex in tri
    ]
    return {
        "variable": variable,
        "value": value,
        "units": VARIABLES[variable]["units"],
        "timestep": timestep,
        "month_label": _timestep_label(ds["time"].values[timestep])["label"],
        "bounds": get_meta()["bounds"],
        "depth_range": [float(depths[0]), float(depths[-1])],
        "triangle_count": len(triangles),
        "vertices": vertices,
        "method": "Marching tetrahedra over the native INCOIS depth/lat/lon grid",
    }


@router.get("/api/forecast")
def get_forecast(lead: int = Query(1, ge=1, le=3)):
    """Baseline 1–3 month SST forecast using damped local linear trends.

    This is deliberately a transparent benchmark, not an operational cyclone
    forecast: each cell fits a least-squares trend over the last eight real
    monthly analyses, clamps that slope to observed month-to-month variability,
    and damps it with lead time.
    """
    ds = _require_dataset()
    history = np.asarray(ds["temperature"].isel(depth=0).values, dtype=float)
    n = min(8, history.shape[0])
    y = history[-n:]
    x = np.arange(n, dtype=float)
    xm = x.mean()
    denom = np.sum((x - xm) ** 2)
    valid = np.isfinite(y)
    count = valid.sum(axis=0)
    mean = np.nansum(y, axis=0) / np.maximum(count, 1)
    slope = np.nansum((x[:, None, None] - xm) * (y - mean), axis=0) / max(denom, 1)
    changes = np.diff(y, axis=0)
    cap = np.nanpercentile(np.abs(changes), 90)
    slope = np.clip(slope, -cap, cap)
    damping = (1.0, 0.65, 0.4)[lead - 1]
    forecast = y[-1] + slope * lead * damping
    forecast[~np.isfinite(y[-1])] = np.nan

    last = np.datetime64(ds["time"].values[-1], "M")
    target = last + np.timedelta64(lead, "M")
    label = _timestep_label(str(target))
    spec = VARIABLES["temperature"]
    return {
        "variable": "temperature",
        "label": "Forecast sea-surface temperature",
        "units": spec["units"],
        "colormap": spec["colormap"],
        "scale": "linear",
        "surface": True,
        "predicted": True,
        "lead": lead,
        "timestep": ds.sizes["time"] - 1 + lead,
        "month": label["month"],
        "month_label": label["label"],
        "shape": list(forecast.shape),
        "bounds": get_meta()["bounds"],
        "lat": [round(float(v), 3) for v in ds["lat"].values],
        "lon": [round(float(v), 3) for v in ds["lon"].values],
        "values": _clean(forecast, 2),
        "empty": not bool(np.isfinite(forecast).any()),
        "range": _minmax(forecast),
        "depth_range": _minmax(forecast),
        "global_range": _ranges["temperature"]["global"],
        "method": "Damped least-squares local trend over the last 8 observed monthly analyses",
        "disclaimer": "Baseline statistical projection for demonstration; not an operational INCOIS forecast or warning.",
    }
