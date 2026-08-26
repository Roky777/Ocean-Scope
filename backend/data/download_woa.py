"""
Download REAL depth-resolved ocean temperature and salinity for the Indian
Ocean from the World Ocean Atlas 2023 (WOA23).

Source: NOAA NCEI, https://www.ncei.noaa.gov/products/world-ocean-atlas
Accessed over OPeNDAP so only the Indian Ocean subset and the five depth
levels we need are transferred (the full global monthly files are ~62 MB each).

NO ACCOUNT OR API KEY IS REQUIRED. This is public-domain NOAA data.

IMPORTANT - what this data is:
  WOA23 is a *climatology*: each "month" is a long-term objectively-analysed
  average over the 1955-2022 record, not a specific calendar month of a
  specific year. So the time axis animates a mean seasonal cycle, which is
  real observational data, but it is NOT a time series of individual months.
  For actual per-month model output, see download_copernicus.py.

Variables: t_an (temperature, degC), s_an (salinity, PSU) - the objectively
analysed mean fields.

Output: backend/data/indian_ocean_woa.nc
        dims (time=12, depth=5, lat, lon)
"""

import sys
import time as _time
from pathlib import Path

import numpy as np
import xarray as xr

OUT = Path(__file__).parent / "indian_ocean_woa.nc"

BASE = "https://www.ncei.noaa.gov/thredds-ocean/dodsC/woa23/DATA"
RES, SUFFIX = "0.25", "04"  # quarter-degree grid

LAT_MIN, LAT_MAX = -20.0, 30.0
LON_MIN, LON_MAX = 40.0, 110.0
DEPTHS = [0.0, 50.0, 100.0, 200.0, 500.0]
MONTHS = list(range(1, 13))

VARIABLES = {"temperature": "t", "salinity": "s"}
RETRIES = 3


def fetch(var_dir: str, code: str, month: int) -> np.ndarray:
    """One month, all requested depths, clipped to the region."""
    url = (
        f"{BASE}/{var_dir}/netcdf/decav/{RES}/"
        f"woa23_decav_{code}{month:02d}_{SUFFIX}.nc"
    )
    last = None
    for attempt in range(RETRIES):
        try:
            with xr.open_dataset(url, decode_times=False) as ds:
                da = (
                    ds[f"{code}_an"]
                    .isel(time=0)
                    .sel(lat=slice(LAT_MIN, LAT_MAX), lon=slice(LON_MIN, LON_MAX))
                    .sel(depth=DEPTHS)
                )
                return da.values.astype("float32"), da["lat"].values, da["lon"].values
        except Exception as exc:  # noqa: BLE001 - OPeNDAP can be flaky
            last = exc
            _time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"{var_dir} month {month}: {last}")


def main() -> None:
    fields = {name: [] for name in VARIABLES}
    lats = lons = None

    for var_dir, code in VARIABLES.items():
        for month in MONTHS:
            t0 = _time.time()
            arr, lats, lons = fetch(var_dir, code, month)
            fields[var_dir].append(arr)
            finite = arr[np.isfinite(arr)]
            print(
                f"  {var_dir:11s} {month:02d}  {arr.shape}  "
                f"{finite.min():6.2f}..{finite.max():6.2f}  ({_time.time() - t0:.1f}s)",
                flush=True,
            )

    ds = xr.Dataset(
        {
            "temperature": (
                ("time", "depth", "lat", "lon"),
                np.stack(fields["temperature"]),
                {"units": "degC", "long_name": "sea_water_temperature"},
            ),
            "salinity": (
                ("time", "depth", "lat", "lon"),
                np.stack(fields["salinity"]),
                {"units": "PSU", "long_name": "sea_water_salinity"},
            ),
        },
        coords={
            "time": ("time", MONTHS, {"long_name": "climatological month", "units": "month"}),
            "depth": ("depth", DEPTHS, {"units": "m", "positive": "down"}),
            "lat": ("lat", lats, {"units": "degrees_north"}),
            "lon": ("lon", lons, {"units": "degrees_east"}),
        },
        attrs={
            "title": "Indian Ocean temperature and salinity (WOA23 monthly climatology)",
            "source": (
                "World Ocean Atlas 2023 (WOA23) decav objectively analysed means, "
                "NOAA NCEI - REAL observational climatology. Each month is a "
                "long-term average over 1955-2022, NOT a specific calendar month."
            ),
            "region": "Indian Ocean",
            "Conventions": "CF-1.8",
        },
    )
    ds.to_netcdf(OUT, engine="netcdf4")
    print(f"\nwrote {OUT}  ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1)
