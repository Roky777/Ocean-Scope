"""
Surface current speed for the study region.

Source: INCOIS ERDDAP, incois_valueadded_products_datasets — GEO_U and GEO_V,
INCOIS's own geostrophic current components derived from their Argo analysis.
REAL observational product; no account needed.

Speed is the vector magnitude sqrt(u^2 + v^2), converted from cm/s to m/s.

COVERAGE LIMIT: this product ends 2019-03-30. Temperature and salinity run to
2026, so if the window in download_incois.py is moved past that date this
variable is simply absent and the app reports it unavailable — it is never
back-filled or invented.

Run download_incois.py first; this adds a variable to indian_ocean.nc.
"""

import numpy as np

from _shared_ingest import SERVER, attach, fetch, monthly_on_base_grid, require_base
from region import LAT_MAX, LAT_MIN, LON_MAX, LON_MIN

DATASET = "incois_valueadded_products_datasets"


def main() -> None:
    base = require_base()
    times = base["time"].values
    start, stop = str(times[0])[:10], str(times[-1])[:10]

    span = (
        f"%5B({start}):1:({stop})%5D"
        f"%5B({LAT_MIN}):1:({LAT_MAX})%5D"
        f"%5B({LON_MIN}):1:({LON_MAX})%5D"
    )
    url = f"{SERVER}/{DATASET}.nc?GEO_U{span},GEO_V{span}"

    ds = fetch(url, f"INCOIS geostrophic currents {start} .. {stop}")
    if ds.sizes.get("time", 0) == 0:
        print("No current data in this window — leaving the variable out.")
        return

    speed = np.sqrt(ds["GEO_U"] ** 2 + ds["GEO_V"] ** 2) / 100.0  # cm/s -> m/s
    speed = speed.assign_coords(time=ds["time"])
    monthly = monthly_on_base_grid(speed, base)
    base.close()

    attach(
        "current_speed",
        monthly,
        {
            "units": "m/s",
            "long_name": "surface_geostrophic_current_speed",
            "source": (
                "INCOIS ERDDAP incois_valueadded_products_datasets — "
                "sqrt(GEO_U^2 + GEO_V^2), monthly mean of 10-day fields"
            ),
        },
    )


if __name__ == "__main__":
    main()
