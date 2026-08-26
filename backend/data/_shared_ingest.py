"""
Helpers shared by the secondary data-source scripts.

Each source (currents, chlorophyll, ...) is a small adapter: fetch a subset,
reduce it to monthly means, put it on the temperature grid, and add it to
indian_ocean.nc as a new variable. Adding another sensor means writing one
more script against this same three-step shape.
"""

import ssl
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr

DATA_DIR = Path(__file__).parent
BASE_PATH = DATA_DIR / "indian_ocean.nc"

SERVER = "https://erddap.incois.gov.in/erddap/griddap"

# INCOIS ERDDAP omits its TLS intermediate certificate; the same workaround
# download_incois.py uses.
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def fetch(url: str, label: str) -> xr.Dataset:
    print(f"requesting {label}...")
    try:
        with urllib.request.urlopen(url, timeout=600, context=SSL_CTX) as r:
            blob = r.read()
    except Exception as exc:  # noqa: BLE001
        print(f"FAILED to reach INCOIS ERDDAP: {exc}", file=sys.stderr)
        raise SystemExit(1)

    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
        tmp.write(blob)
        path = tmp.name
    print(f"  {len(blob) / 1024:.0f} KB")
    return xr.open_dataset(path)


def require_base() -> xr.Dataset:
    if not BASE_PATH.exists():
        print(
            f"{BASE_PATH.name} not found. Run download_incois.py first.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return xr.open_dataset(BASE_PATH)


def monthly_on_base_grid(da: xr.DataArray, base: xr.Dataset) -> xr.DataArray:
    """Monthly-mean `da`, then align it to the base grid and time axis."""
    da = da.rename({"latitude": "lat", "longitude": "lon"})

    # Collapse to one field per calendar month.
    monthly = da.groupby("time.month").first()  # placeholder shape
    grouped = {}
    times = da["time"].values
    keys = [(int(str(t)[:4]), int(str(t)[5:7])) for t in times]
    for key in sorted(set(keys)):
        sel = [i for i, k in enumerate(keys) if k == key]
        grouped[key] = da.isel(time=sel).mean(dim="time", skipna=True)

    # Line the months up with the base dataset's own timestamps.
    base_keys = [
        (int(str(t)[:4]), int(str(t)[5:7])) for t in base["time"].values
    ]
    frames = []
    for key in base_keys:
        frame = grouped.get(key)
        if frame is None:
            frame = xr.full_like(next(iter(grouped.values())), np.nan)
        frames.append(frame)

    stacked = xr.concat(frames, dim="time").assign_coords(time=base["time"].values)

    # Put it on the temperature grid so every layer shares one geometry.
    if stacked.sizes.get("lat") != base.sizes["lat"] or stacked.sizes.get("lon") != base.sizes["lon"]:
        stacked = stacked.interp(lat=base["lat"], lon=base["lon"])
    else:
        stacked = stacked.assign_coords(lat=base["lat"], lon=base["lon"])

    del monthly
    return stacked


def attach(name: str, values: xr.DataArray, attrs: dict) -> None:
    """Add (or replace) a variable in indian_ocean.nc."""
    base = require_base()
    values.name = name
    values.attrs = attrs
    merged = base.drop_vars(name, errors="ignore").assign({name: values})
    merged.attrs = base.attrs
    base.close()

    tmp = BASE_PATH.with_suffix(".nc.tmp")
    merged.to_netcdf(tmp, engine="netcdf4")
    merged.close()
    tmp.replace(BASE_PATH)

    finite = values.values[np.isfinite(values.values)]
    print(
        f"added '{name}' to {BASE_PATH.name}  shape={tuple(values.sizes.values())}  "
        f"range={finite.min():.3f}..{finite.max():.3f} {attrs.get('units','')}"
    )
