"""
Surface chlorophyll-a for the study region.

Source: INCOIS ERDDAP, incois_oceansat2_datasets — the CHL product from
Oceansat-2's Ocean Colour Monitor. REAL satellite observations; no account
needed. (Copernicus Marine's biogeochemistry products carry chlorophyll too,
but require an account — see download_copernicus.py.)

The native grid is ~0.04 deg daily, far finer than anything else here, so the
request strides it down to roughly 1 deg and every third day, then averages to
monthly means and interpolates onto the temperature grid.

Chlorophyll spans orders of magnitude, which is why the UI defaults this
variable to a logarithmic colour scale.

COVERAGE LIMIT: 2011-02 to 2020-05. Outside that window the variable is
absent and reported unavailable rather than back-filled.

Run download_incois.py first; this adds a variable to indian_ocean.nc.
"""

from _shared_ingest import SERVER, attach, fetch, monthly_on_base_grid, require_base
from region import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN

DATASET = "incois_oceansat2_datasets"

LAT_STRIDE = 26  # ~0.0388 deg * 26 ~= 1 deg
LON_STRIDE = 25  # ~0.0400 deg * 25 == 1 deg
TIME_STRIDE = 3  # every third day is plenty for a monthly mean


def main() -> None:
    base = require_base()
    times = base["time"].values
    start, stop = str(times[0])[:10], str(times[-1])[:10]

    url = (
        f"{SERVER}/{DATASET}.nc?CHL"
        f"%5B({start}):{TIME_STRIDE}:({stop})%5D"
        f"%5B({LAT_MIN}):{LAT_STRIDE}:({LAT_MAX})%5D"
        f"%5B({LON_MIN}):{LON_STRIDE}:({LON_MAX})%5D"
    )

    ds = fetch(url, f"Oceansat-2 chlorophyll {start} .. {stop}")
    if ds.sizes.get("time", 0) == 0:
        print("No chlorophyll data in this window — leaving the variable out.")
        return

    monthly = monthly_on_base_grid(ds["CHL"], base)
    base.close()

    attach(
        "chlorophyll",
        monthly,
        {
            "units": "mg/m³",
            "long_name": "mass_concentration_of_chlorophyll_a_in_sea_water",
            "source": (
                "INCOIS ERDDAP incois_oceansat2_datasets — Oceansat-2 OCM CHL, "
                "monthly mean of ~3-daily fields, interpolated to the 1 deg grid"
            ),
        },
    )


if __name__ == "__main__":
    main()
