"""Convert the canonical NetCDF snapshot to a cloud-native chunked Zarr store.

The API automatically discovers ``indian_ocean.zarr`` on its next start and
keeps NetCDF as a zero-configuration fallback.  Chunking is aligned to the
query pattern: one time, a few depths, and a regional latitude/longitude ROI.
"""

from pathlib import Path

import xarray as xr

DATA_DIR = Path(__file__).resolve().parent
SOURCE = DATA_DIR / "indian_ocean.nc"
TARGET = DATA_DIR / "indian_ocean.zarr"


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Missing {SOURCE.name}; run download_incois.py first")
    ds = xr.open_dataset(SOURCE, chunks={"time": 1, "depth": 1, "lat": 24, "lon": 32})
    encoding = {}
    for name, variable in ds.data_vars.items():
        chunks = tuple(min(variable.sizes[dim], {"time": 1, "depth": 1, "lat": 24, "lon": 32}.get(dim, variable.sizes[dim])) for dim in variable.dims)
        encoding[name] = {"chunks": chunks}
    ds.attrs["storage_backend"] = "chunked Zarr"
    ds.to_zarr(TARGET, mode="w", encoding=encoding, consolidated=True)
    print(f"Wrote {TARGET} with time/depth/ROI-aligned chunks")


if __name__ == "__main__":
    main()
