"""
Download REAL sea-surface temperature for the Indian Ocean region.

Source: NOAA OISST v2.1 (AVHRR), 0.25 degree daily analysis, served by the
NCEI ERDDAP server. This is genuine satellite/in-situ blended observational
data and needs no account or API key.

For each requested month this pulls ~5 daily fields (every 7th day) and
averages them into an approximate monthly mean. That is NOT the official
NOAA monthly product - it is a mean of ~5 daily snapshots - but it is real
observational data and is labelled as such in the output file's attributes.

Land is NaN in the source data, which is what produces the coastline-shaped
gaps in the rendered map.

Output: backend/data/indian_ocean_sst.nc  (dims: time, lat, lon)
"""

import calendar
import ssl
import sys
import tempfile
import urllib.request
from pathlib import Path

import certifi
import numpy as np
import xarray as xr

OUT = Path(__file__).parent / "indian_ocean_sst.nc"

DATASET = "ncdc_oisst_v2_avhrr_by_time_zlev_lat_lon"
BASE = f"https://www.ncei.noaa.gov/erddap/griddap/{DATASET}.nc"

# Indian Ocean region, matching the INCOIS LAS view.
LAT_MIN, LAT_MAX = -20.0, 30.0
LON_MIN, LON_MAX = 40.0, 110.0

YEARS = [2024, 2025]
MONTHS = list(range(1, 13))

_CTX = ssl.create_default_context(cafile=certifi.where())


def month_url(year: int, month: int) -> str:
    last = calendar.monthrange(year, month)[1]
    start = f"{year}-{month:02d}-01T12:00:00Z"
    stop = f"{year}-{month:02d}-{min(last, 29):02d}T12:00:00Z"
    return (
        f"{BASE}?sst"
        f"%5B({start}):7:({stop})%5D"      # time, every 7th day
        f"%5B(0.0):1:(0.0)%5D"             # zlev (surface)
        f"%5B({LAT_MIN}):1:({LAT_MAX})%5D"
        f"%5B({LON_MIN}):1:({LON_MAX})%5D"
    )


def fetch_month(year: int, month: int) -> xr.DataArray:
    """Download one month and collapse it to a single mean field."""
    with urllib.request.urlopen(month_url(year, month), timeout=180, context=_CTX) as r:
        blob = r.read()

    with tempfile.NamedTemporaryFile(suffix=".nc", delete=False) as tmp:
        tmp.write(blob)
        tmp_path = tmp.name

    try:
        with xr.open_dataset(tmp_path) as ds:
            # Average the daily snapshots, drop the singleton depth axis.
            field = ds["sst"].mean(dim="time", skipna=True)
            if "depth" in field.dims:
                field = field.isel(depth=0, drop=True)
            return field.rename({"latitude": "lat", "longitude": "lon"}).load()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def main() -> None:
    fields, stamps = [], []

    for year in YEARS:
        for month in MONTHS:
            label = f"{year}-{month:02d}"
            try:
                field = fetch_month(year, month)
            except Exception as exc:  # noqa: BLE001
                print(f"  {label}  FAILED: {exc}", file=sys.stderr)
                continue
            fields.append(field)
            stamps.append(np.datetime64(f"{year}-{month:02d}-15"))
            valid = field.values[np.isfinite(field.values)]
            print(f"  {label}  ok  {valid.min():.2f}..{valid.max():.2f} degC")

    if not fields:
        print("No months downloaded. Check your network connection.", file=sys.stderr)
        raise SystemExit(1)

    da = xr.concat(fields, dim="time").assign_coords(
        time=("time", np.array(stamps, dtype="datetime64[ns]"))
    )
    da.name = "sst"
    da.attrs = {
        "units": "degC",
        "long_name": "sea_surface_temperature",
        "standard_name": "sea_surface_temperature",
    }

    ds = xr.Dataset({"sst": da})
    ds.attrs = {
        "title": "Indian Ocean SST (approximate monthly means)",
        "source": (
            "NOAA OISST v2.1 AVHRR daily 0.25deg via NCEI ERDDAP - REAL "
            "observational data. Each field is the mean of ~5 daily snapshots "
            "(every 7th day of the month), not the official NOAA monthly mean."
        ),
        "region": "Indian Ocean",
        "Conventions": "CF-1.8",
    }
    ds.to_netcdf(OUT, engine="netcdf4")

    vals = da.values[np.isfinite(da.values)]
    print(
        f"\nwrote {OUT}\n  shape={da.shape}  months={len(fields)}  "
        f"range={vals.min():.2f}..{vals.max():.2f} degC"
    )


if __name__ == "__main__":
    main()
