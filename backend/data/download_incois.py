"""
Download REAL gridded ocean temperature and salinity from INCOIS.

Source: INCOIS ERDDAP, https://erddap.incois.gov.in/erddap
Dataset: incois_argo_mnt_VAM
    "INCOIS ARGO Monthly data Variational Analysis Methodology"

This is INCOIS's own operational gridded Argo product for the Indian Ocean —
the same institution and basin as the SIH26067 problem statement. It is a real
monthly TIME SERIES (not a climatology): 271 monthly fields from 2004-01 to
2026-07, on a 1° grid covering 29.5°S–29.5°N, 30.5°E–119.5°E, with 24 depth
levels from 5 m to 2000 m, carrying both temperature and salinity.

NO ACCOUNT OR API KEY IS REQUIRED.

The whole subset comes back in a single ERDDAP request (~5 MB, a few seconds).

Output: backend/data/indian_ocean.nc
        dims (time, depth, lat, lon), vars temperature + salinity
"""

import ssl
import sys
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr

def _ssl_context() -> ssl.SSLContext:
    """
    INCOIS ERDDAP does not send its TLS intermediate certificate. macOS fetches
    the missing link automatically, but OpenSSL (and therefore certifi) does
    not, so plain certifi verification fails. `truststore` verifies against the
    OS trust store, which keeps certificate checking ON.
    """
    try:
        import truststore

        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())


SSL_CTX = _ssl_context()

OUT = Path(__file__).parent / "indian_ocean.nc"
TMP = Path(__file__).parent / "_incois_raw.nc"

SERVER = "https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.nc"

# Region and depth levels come from region.py so the ocean grid and the
# coastline geometry always cover exactly the same area.
from region import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX, DEPTHS  # noqa: E402

# Twelve months chosen so that EVERY variable the app offers exists over the
# same period. Temperature/salinity run to 2026, but INCOIS's geostrophic
# currents stop at 2019-03 and Oceansat-2 chlorophyll at 2020-05, so this is
# the most recent window where all four overlap. Shift it later and the extra
# variables correctly report themselves unavailable rather than being faked.
START_MONTH = "2018-04-15"
END_MONTH = "2019-03-15"


def build_url() -> str:
    span = (
        f"%5B({START_MONTH}):1:({END_MONTH})%5D"
        f"%5B({min(DEPTHS)}):1:({max(DEPTHS)})%5D"
        f"%5B({LAT_MIN}):1:({LAT_MAX})%5D"
        f"%5B({LON_MIN}):1:({LON_MAX})%5D"
    )
    return f"{SERVER}?TEMP{span},SAL{span}"


def main() -> None:
    url = build_url()
    print(f"requesting INCOIS ERDDAP subset...\n  {url[:110]}...")

    try:
        with urllib.request.urlopen(url, timeout=300, context=SSL_CTX) as r:
            TMP.write_bytes(r.read())
    except Exception as exc:  # noqa: BLE001
        print(
            f"FAILED to reach INCOIS ERDDAP: {exc}\n"
            "If this is a network/TLS error, check connectivity. If the server "
            "is down for maintenance, retry later or use download_woa.py "
            "(NOAA World Ocean Atlas) as a fallback.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    print(f"  downloaded {TMP.stat().st_size // 1024} KB")

    with xr.open_dataset(TMP) as raw:
        ds = (
            raw.sel(ZAX=DEPTHS)
            .rename({"ZAX": "depth", "latitude": "lat", "longitude": "lon",
                     "TEMP": "temperature", "SAL": "salinity"})
            .load()
        )

    ds["temperature"].attrs = {"units": "degC", "long_name": "sea_water_temperature"}
    ds["salinity"].attrs = {"units": "PSU", "long_name": "sea_water_salinity"}
    ds["depth"].attrs = {"units": "m", "positive": "down"}

    ds.attrs = {
        "title": "Indian Ocean temperature and salinity (INCOIS gridded Argo, VAM)",
        "source": (
            "INCOIS ERDDAP dataset incois_argo_mnt_VAM — 'INCOIS ARGO Monthly "
            "data Variational Analysis Methodology'. REAL observational monthly "
            "analysis produced by INCOIS from Argo float profiles."
        ),
        "source_url": "https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.html",
        "region": "Indian Ocean",
        "Conventions": "CF-1.8",
    }

    ds.to_netcdf(OUT, engine="netcdf4")
    TMP.unlink(missing_ok=True)

    print(f"\nwrote {OUT}  ({OUT.stat().st_size // 1024} KB)")
    print(f"  months : {ds.sizes['time']}  "
          f"({str(ds.time.values[0])[:10]} .. {str(ds.time.values[-1])[:10]})")
    print(f"  depths : {[float(d) for d in ds.depth.values]}")
    print(f"  grid   : {ds.sizes['lat']} lat x {ds.sizes['lon']} lon")
    for name in ("temperature", "salinity"):
        a = ds[name].values
        f = a[np.isfinite(a)]
        print(f"  {name:11s}: {f.min():6.2f} .. {f.max():6.2f}  "
              f"(p0.5-p99.5 {np.percentile(f, 0.5):.2f} .. {np.percentile(f, 99.5):.2f})")


if __name__ == "__main__":
    main()
