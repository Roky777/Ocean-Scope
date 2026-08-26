"""
Derived hazard indicators for the Hazard Advisory section.

Everything here is COMPUTED from the loaded INCOIS temperature field using
documented, standard oceanography. Nothing is hardcoded or invented.

Tropical Cyclone Heat Potential (TCHP), also called Ocean Heat Content, is the
integrated heat stored above the 26 degC isotherm (Leipper & Volgenau, 1972):

    D26  = depth at which temperature crosses 26 degC
    TCHP = rho * cp * integral( T(z) - 26 ) dz,  from surface to D26

26 degC is the conventional threshold for tropical cyclone maintenance, and a
DEEP warm layer matters more than a warm skin: a shallow warm layer is mixed
away by a storm's own winds, while a deep one keeps feeding it. Operational
centres treat TCHP above ~50 kJ/cm^2 as supportive of intensification and
above ~100 kJ/cm^2 as strongly supportive.

HONEST LIMITATION, surfaced in the UI: this dataset carries 5 depth levels
(5/50/100/200/500 m), so D26 is linearly interpolated between coarse levels
and the integral is a 5-point trapezoid. That is enough to locate deep warm
pools and rank them, but it is a PROXY, not an operational INCOIS product.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, HTTPException, Query

from . import ocean

router = APIRouter()

T_THRESHOLD = 26.0        # degC, tropical cyclone maintenance threshold
RHO = 1026.0              # kg/m^3, seawater density
CP = 3993.0               # J/(kg K), specific heat capacity of seawater

# kJ/cm^2. Operational rule-of-thumb bands.
TCHP_MODERATE = 50.0
TCHP_HIGH = 90.0

# Named sub-basins, used to write advisories in plain language.
# (lat_min, lat_max, lon_min, lon_max)
REGIONS = [
    # Order matters: the first box containing the point wins, so narrower
    # named seas are listed before the basins that enclose them. Together
    # these cover the whole India EEZ region (5-25 N, 65-97 E), so the
    # generic fallback is only reached at the very edges.
    ("Andaman Sea",          5.0, 17.0, 92.0, 99.0),
    ("Gulf of Mannar",       4.0,  9.5, 76.0, 82.0),
    ("Bay of Bengal",        5.0, 23.0, 78.0, 92.0),
    ("Lakshadweep Sea",      5.0, 14.0, 68.0, 76.0),
    ("Arabian Sea",          5.0, 25.0, 60.0, 78.0),
]


def region_for(lat: float, lon: float) -> str:
    for name, la0, la1, lo0, lo1 in REGIONS:
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return name
    return "Indian Ocean"


def severity_for(tchp: float) -> str:
    if tchp >= TCHP_HIGH:
        return "high"
    if tchp >= TCHP_MODERATE:
        return "moderate"
    if tchp > 0:
        return "low"
    return "none"


def compute(timestep: int):
    """Return (d26, tchp, lats, lons) grids for one timestep. NaN over land."""
    ds = ocean._require_dataset()

    if timestep < 0 or timestep >= ds.sizes["time"]:
        raise HTTPException(400, f"timestep out of range (0..{ds.sizes['time'] - 1})")

    temp = ds["temperature"].isel(time=timestep)     # (depth, lat, lon)
    depths = np.asarray(ds["depth"].values, dtype="float64")
    t = np.asarray(temp.values, dtype="float64")

    nz, ny, nx = t.shape
    d26 = np.full((ny, nx), np.nan)
    tchp = np.full((ny, nx), np.nan)

    surface_valid = np.isfinite(t[0])

    for j in range(ny):
        for i in range(nx):
            if not surface_valid[j, i]:
                continue  # land
            col = t[:, j, i]
            ok = np.isfinite(col)
            if ok.sum() < 2:
                continue
            z = depths[ok]
            tv = col[ok]

            if tv[0] < T_THRESHOLD:
                # Surface already below the threshold: no warm layer at all.
                d26[j, i] = 0.0
                tchp[j, i] = 0.0
                continue

            # Depth where the profile first crosses 26 degC, interpolated.
            cross = np.where(tv < T_THRESHOLD)[0]
            if cross.size:
                k = cross[0]
                t_above, t_below = tv[k - 1], tv[k]
                z_above, z_below = z[k - 1], z[k]
                frac = (t_above - T_THRESHOLD) / (t_above - t_below)
                d_26 = z_above + frac * (z_below - z_above)
                z_int = np.append(z[:k], d_26)
                t_int = np.append(tv[:k], T_THRESHOLD)
            else:
                # Never crosses within the sampled column: integrate what we have
                # and cap at the deepest sampled level (conservative).
                d_26 = z[-1]
                z_int, t_int = z, tv

            d26[j, i] = d_26
            excess = np.clip(t_int - T_THRESHOLD, 0, None)
            # J/m^2 -> kJ/cm^2 : divide by 1e7
            tchp[j, i] = RHO * CP * np.trapezoid(excess, z_int) / 1e7

    return d26, tchp, np.asarray(ds["lat"].values), np.asarray(ds["lon"].values)


def _advisories(d26, tchp, lats, lons, stamp: dict, limit: int = 6):
    """Collapse flagged cells into one ranked bulletin per named sub-basin."""
    buckets: dict[str, dict] = {}

    ny, nx = tchp.shape
    for j in range(ny):
        for i in range(nx):
            v = tchp[j, i]
            if not np.isfinite(v) or v < TCHP_MODERATE:
                continue
            name = region_for(float(lats[j]), float(lons[i]))
            b = buckets.setdefault(
                name, {"region": name, "peak": 0.0, "cells": 0, "d26": 0.0,
                       "lat": 0.0, "lon": 0.0}
            )
            b["cells"] += 1
            if v > b["peak"]:
                b["peak"] = float(v)
                b["d26"] = float(d26[j, i])
                b["lat"] = float(lats[j])
                b["lon"] = float(lons[i])

    out = []
    for b in buckets.values():
        sev = severity_for(b["peak"])
        out.append({
            "id": f"{b['region'].lower().replace(' ', '-').replace('/', '')}-{stamp['label'].replace(' ', '-').lower()}",
            "region": b["region"],
            "severity": sev,
            "peak_tchp": round(b["peak"], 1),
            "d26": round(b["d26"], 1),
            "area_cells": b["cells"],
            "lat": round(b["lat"], 2),
            "lon": round(b["lon"], 2),
            "period": stamp["label"],
            "headline": (
                f"Elevated cyclone heat potential — {b['region']} — "
                f"{stamp['label']} — {sev.upper()}"
            ),
            "detail": (
                f"Peak TCHP {b['peak']:.0f} kJ/cm² with the 26 °C isotherm at "
                f"{b['d26']:.0f} m across {b['cells']} grid cell"
                f"{'s' if b['cells'] != 1 else ''}. A warm layer this deep can "
                f"sustain or intensify a tropical cyclone passing over it, "
                f"because storm-driven mixing cannot easily overturn it."
            ),
        })

    order = {"high": 0, "moderate": 1, "low": 2, "none": 3}
    out.sort(key=lambda a: (order[a["severity"]], -a["peak_tchp"]))
    return out[:limit]


@router.get("/api/hazard")
def get_hazard(timestep: int = Query(0, ge=0)):
    """
    Cyclone-heat-potential hazard field + plain-language advisories.

    Returns a grid shaped exactly like /api/field so the same renderer can
    draw it, plus a ranked advisory bulletin.
    """
    ds = ocean._require_dataset()
    d26, tchp, lats, lons = compute(timestep)

    grid, glats, glons = ocean._downsample(tchp, lats, lons)
    d26_grid, _, _ = ocean._downsample(d26, lats, lons)

    finite = grid[np.isfinite(grid)]
    stamp = ocean._timestep_label(ds["time"].values[timestep])

    return {
        "variable": "cyclone_heat_potential",
        "label": "Cyclone Heat Potential",
        "units": "kJ/cm²",
        "colormap": "risk",
        "timestep": timestep,
        "month_label": stamp["label"],
        # Same shape key the field endpoint returns: the renderer uses it to
        # decide when the mesh has to be rebuilt.
        "shape": [len(glats), len(glons)],
        "bounds": {
            "lat_min": float(glats.min()), "lat_max": float(glats.max()),
            "lon_min": float(glons.min()), "lon_max": float(glons.max()),
        },
        "lat": [round(float(v), 4) for v in glats],
        "lon": [round(float(v), 4) for v in glons],
        "values": [
            [None if not np.isfinite(v) else round(float(v), 1) for v in row]
            for row in grid
        ],
        "d26": [
            [None if not np.isfinite(v) else round(float(v), 1) for v in row]
            for row in d26_grid
        ],
        "range": {
            "min": 0.0,
            "max": round(float(finite.max()), 1) if finite.size else 1.0,
        },
        "thresholds": {"moderate": TCHP_MODERATE, "high": TCHP_HIGH},
        "advisories": _advisories(d26, tchp, lats, lons, stamp),
        "method": (
            "TCHP = ρ·cp·∫(T−26 °C)dz from the surface to the 26 °C isotherm "
            "(Leipper & Volgenau 1972), computed from the INCOIS gridded Argo "
            "temperature profile over 5 depth levels."
        ),
    }
