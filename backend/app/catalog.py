"""Dynamic variable metadata derived from CF/NetCDF attributes."""

from __future__ import annotations

from typing import Any

import xarray as xr


DEFAULTS: dict[str, dict[str, Any]] = {
    "temperature": {"label": "Temperature", "units": "°C", "colormap": "thermal"},
    "salinity": {"label": "Salinity", "units": "PSU", "colormap": "haline"},
    "current_speed": {"label": "Current Speed", "units": "m/s", "colormap": "speed", "scale": "linear"},
    "chlorophyll": {"label": "Chlorophyll-a", "units": "mg/m³", "colormap": "algae", "scale": "log"},
}

COORDINATES = {"time", "depth", "lat", "lon", "latitude", "longitude"}


def variable_catalog(ds: xr.Dataset) -> dict[str, dict[str, Any]]:
    """Return UI metadata for every renderable numeric data variable."""
    result: dict[str, dict[str, Any]] = {}
    for name, da in ds.data_vars.items():
        if name in {"current_u", "current_v"} or not set(da.dims).intersection({"lat", "latitude"}):
            continue
        base = DEFAULTS.get(name, {})
        label = base.get("label") or da.attrs.get("long_name") or da.attrs.get("standard_name") or name.replace("_", " ").title()
        result[name] = {
            "id": name,
            "label": label,
            "units": da.attrs.get("units") or base.get("units", ""),
            "colormap": da.attrs.get("colormap") or base.get("colormap", "viridis"),
            "scale": da.attrs.get("scale") or base.get("scale", "linear"),
            "surface": "depth" not in da.dims,
            "available": True,
            "dimensions": list(da.dims),
            "source": da.attrs.get("source", ds.attrs.get("source", "")),
        }
    return result
