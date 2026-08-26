"""
OPTIONAL: download Indian Ocean temperature/salinity from Copernicus Marine.

This script is NOT run by the default setup. The prototype ships with WOA23
data (see download_woa.py), which needs no credentials. Use this one if you
want per-month model output for specific calendar months rather than WOA's
long-term monthly climatology.

WHAT YOU MUST SET UP FIRST
--------------------------
1. Create a free account:
       https://data.marine.copernicus.eu/register
   (approval is usually immediate; no payment details required)

2. Install the toolbox into the backend venv:
       source backend/venv/bin/activate
       pip install copernicusmarine

3. Log in once - this stores a token in ~/.copernicusmarine/:
       copernicusmarine login
   It will prompt for the username and password from step 1.

4. Then run this script:
       python backend/data/download_copernicus.py

After it finishes, point the API at the new file by setting
    WOA_PATH = DATA_DIR / "indian_ocean_cmems.nc"
in backend/app/main.py, or just rename the file to indian_ocean_woa.nc.
The variable names below are already mapped to match.
"""

import sys
from pathlib import Path

OUT_DIR = Path(__file__).parent
OUT_NAME = "indian_ocean_cmems.nc"

# GLORYS12V1 global ocean physics reanalysis, monthly means, 1/12 degree.
DATASET_ID = "cmems_mod_glo_phy_my_0.083deg_P1M-m"

LAT_MIN, LAT_MAX = -20.0, 30.0
LON_MIN, LON_MAX = 40.0, 110.0
DEPTHS = (0.0, 500.0)
START, END = "2023-01-01", "2023-12-31"


def main() -> None:
    try:
        import copernicusmarine
    except ImportError:
        print(
            "copernicusmarine is not installed.\n"
            "  source backend/venv/bin/activate && pip install copernicusmarine\n"
            "Then run 'copernicusmarine login' before retrying.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    print(f"subsetting {DATASET_ID} ...")
    copernicusmarine.subset(
        dataset_id=DATASET_ID,
        variables=["thetao", "so"],  # potential temperature, practical salinity
        minimum_longitude=LON_MIN,
        maximum_longitude=LON_MAX,
        minimum_latitude=LAT_MIN,
        maximum_latitude=LAT_MAX,
        minimum_depth=DEPTHS[0],
        maximum_depth=DEPTHS[1],
        start_datetime=START,
        end_datetime=END,
        output_directory=str(OUT_DIR),
        output_filename=OUT_NAME,
    )

    # Rename to the names the API expects (thetao -> temperature, so -> salinity).
    import xarray as xr

    path = OUT_DIR / OUT_NAME
    with xr.open_dataset(path) as ds:
        renamed = ds.rename(
            {
                "thetao": "temperature",
                "so": "salinity",
                "latitude": "lat",
                "longitude": "lon",
            }
        )
        renamed.load()
    renamed.to_netcdf(path)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
