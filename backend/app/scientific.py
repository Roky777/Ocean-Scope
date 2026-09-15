"""TEOS-10 profile diagnostics and vertical transect sampling."""

from __future__ import annotations

from math import asin, cos, radians, sin, sqrt

import gsw
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from . import ocean

router = APIRouter(prefix="/api/science", tags=["scientific diagnostics"])


class TransectRequest(BaseModel):
    start_lat: float = Field(ge=-90, le=90)
    start_lon: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lon: float = Field(ge=-180, le=180)
    timestep: int = Field(ge=0)
    variable: str = "temperature"
    samples: int = Field(36, ge=8, le=160)


def _distance_km(lat1, lon1, lat2, lon2):
    p1, p2 = radians(lat1), radians(lat2)
    dp, dl = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(a))


def _bracket(coords: np.ndarray, value: float) -> tuple[int, int, float]:
    if value < coords[0] or value > coords[-1]:
        raise HTTPException(422, "Requested point lies outside the dataset bounds")
    hi = int(np.searchsorted(coords, value, side="right"))
    hi = min(max(hi, 1), len(coords) - 1)
    lo = hi - 1
    span = float(coords[hi] - coords[lo])
    return lo, hi, 0.0 if span == 0 else float((value - coords[lo]) / span)


def horizontal_profile(values: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float):
    """Bilinear profile, with an explicit per-level wet-corner fallback."""
    j0, j1, wy = _bracket(lats, lat)
    i0, i1, wx = _bracket(lons, lon)
    weights = np.array([(1-wy)*(1-wx), (1-wy)*wx, wy*(1-wx), wy*wx])
    corners = np.stack((values[:, j0, i0], values[:, j0, i1], values[:, j1, i0], values[:, j1, i1]), axis=1)
    result = np.full(values.shape[0], np.nan)
    fallback_levels = 0
    for k, row in enumerate(corners):
        valid = np.isfinite(row)
        if valid.all():
            result[k] = float(row @ weights)
        elif valid.any():
            fallback_levels += 1
            local_weights = weights[valid]
            result[k] = float(row[valid] @ (local_weights / local_weights.sum()))
    method = "bilinear_horizontal_interpolation" if fallback_levels == 0 else "wet_corner_weighted_fallback"
    cell_km = max(
        _distance_km(float(lats[j0]), lon, float(lats[j1]), lon),
        _distance_km(lat, float(lons[i0]), lat, float(lons[i1])),
    )
    return result, method, round(cell_km, 2), fallback_levels


def teos10_profile(temperature, practical_salinity, depths, lat, lon) -> dict:
    """Calculate TEOS-10 state variables and transparent layer diagnostics."""
    t = np.asarray(temperature, float)
    sp = np.asarray(practical_salinity, float)
    z = np.asarray(depths, float)
    valid = np.isfinite(t) & np.isfinite(sp) & np.isfinite(z)
    if valid.sum() < 2:
        raise HTTPException(422, "At least two paired temperature/salinity depths are required")
    t, sp, z = t[valid], sp[valid], z[valid]
    order = np.argsort(z)
    t, sp, z = t[order], sp[order], z[order]
    p = gsw.p_from_z(-z, lat)
    sa = gsw.SA_from_SP(sp, p, lon, lat)
    ct = gsw.CT_from_t(sa, t, p)
    sigma0 = gsw.sigma0(sa, ct)
    n2, p_mid = gsw.Nsquared(sa, ct, p, lat)
    z_mid = -gsw.z_from_p(p_mid, lat)

    reference = int(np.argmin(np.abs(z - 10.0)))
    denser = np.flatnonzero(sigma0 - sigma0[reference] >= 0.03)
    denser = denser[denser > reference]
    mld = float(z[denser[0]]) if denser.size else float(z[-1])
    gradient = np.abs(np.gradient(ct, z))
    thermocline_index = int(np.nanargmax(gradient))
    return {
        "method": "TEOS-10 via GSW",
        "mld_method": "sigma0 threshold of 0.03 kg/m³ from the level nearest 10 m",
        "mixed_layer_depth_m": round(mld, 2),
        "thermocline_depth_m": round(float(z[thermocline_index]), 2),
        "maximum_temperature_gradient_c_per_m": round(float(gradient[thermocline_index]), 6),
        "profile": [
            {
                "depth": round(float(depth), 2),
                "pressure_dbar": round(float(pressure), 3),
                "temperature": round(float(temp), 4),
                "practical_salinity": round(float(sal), 4),
                "absolute_salinity": round(float(abs_sal), 4),
                "conservative_temperature": round(float(cons_temp), 4),
                "sigma0": round(float(density), 4),
            }
            for depth, pressure, temp, sal, abs_sal, cons_temp, density
            in zip(z, p, t, sp, sa, ct, sigma0)
        ],
        "stratification": [
            {"depth": round(float(depth), 2), "n2_s_2": round(float(value), 9)}
            for depth, value in zip(z_mid, n2) if np.isfinite(value)
        ],
    }


def profile_at(lat: float, lon: float, timestep: int) -> dict:
    ds = ocean._require_dataset()
    if timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {timestep}")
    lats, lons = np.asarray(ds.lat, float), np.asarray(ds.lon, float)
    temperature, method_t, footprint, fallback_t = horizontal_profile(
        np.asarray(ds.temperature.isel(time=timestep), float), lats, lons, lat, lon,
    )
    salinity, method_s, _, fallback_s = horizontal_profile(
        np.asarray(ds.salinity.isel(time=timestep), float), lats, lons, lat, lon,
    )
    result = teos10_profile(temperature, salinity, np.asarray(ds.depth, float), lat, lon)
    result.update({
        "location": {"lat": lat, "lon": lon},
        "time": ocean._iso_time(ds.time.values[timestep]),
        "timestep": timestep,
        "spatial_sampling": {
            "method": method_t if method_t == method_s else f"{method_t}; {method_s}",
            "grid_footprint_km": footprint,
            "fallback_levels": max(fallback_t, fallback_s),
        },
        "provenance": ocean.provenance("derived", timestep, "temperature + salinity", "TEOS-10 via GSW"),
    })
    return result


@router.get("/profile")
def get_profile(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    timestep: int = Query(0, ge=0),
):
    return profile_at(lat, lon, timestep)


@router.post("/transect")
def transect(request: TransectRequest):
    ds = ocean._require_dataset()
    if request.timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {request.timestep}")
    if request.variable not in {"temperature", "salinity", "sigma0"}:
        raise HTTPException(422, "Transects support temperature, salinity, and sigma0")
    fractions = np.linspace(0, 1, request.samples)
    lats = request.start_lat + fractions * (request.end_lat - request.start_lat)
    lons = request.start_lon + fractions * (request.end_lon - request.start_lon)
    total = _distance_km(request.start_lat, request.start_lon, request.end_lat, request.end_lon)
    rows, methods = [], set()
    for fraction, lat, lon in zip(fractions, lats, lons):
        if request.variable == "sigma0":
            try:
                diag = profile_at(float(lat), float(lon), request.timestep)
                by_depth = {point["depth"]: point["sigma0"] for point in diag["profile"]}
                values = [by_depth.get(round(float(depth), 2)) for depth in ds.depth.values]
                methods.add(diag["spatial_sampling"]["method"])
            except HTTPException:
                values = [None] * ds.sizes["depth"]
                methods.add("no_valid_water_column")
        else:
            raw = np.asarray(ds[request.variable].isel(time=request.timestep), float)
            values, method, _, _ = horizontal_profile(raw, np.asarray(ds.lat), np.asarray(ds.lon), float(lat), float(lon))
            values = [None if not np.isfinite(v) else round(float(v), 4) for v in values]
            methods.add(method)
        rows.append({
            "distance_km": round(float(fraction * total), 2),
            "lat": round(float(lat), 4),
            "lon": round(float(lon), 4),
            "values": values,
        })
    units = {"temperature": "°C", "salinity": "PSU", "sigma0": "kg/m³"}[request.variable]
    return {
        "variable": request.variable,
        "units": units,
        "timestep": request.timestep,
        "time": ocean._iso_time(ds.time.values[request.timestep]),
        "start": {"lat": request.start_lat, "lon": request.start_lon},
        "end": {"lat": request.end_lat, "lon": request.end_lon},
        "distance_km": round(total, 2),
        "depths": [float(v) for v in ds.depth.values],
        "samples": rows,
        "spatial_methods": sorted(methods),
        "provenance": ocean.provenance("derived", request.timestep, request.variable, "geodesic path with horizontal interpolation"),
    }
