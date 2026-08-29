"""Fetch real BGC-Argo and OceanGliders profiles in the India study region."""

import csv
import io
import json
import ssl
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import xarray as xr
import certifi

OUT = Path(__file__).parent / "instrument_profiles.json"
BGC_FLOATS = ("2902306", "7902190", "7902200")
BGC_ROOT = "https://data-argo.ifremer.fr/dac/incois"
GLIDER_URL = (
    "https://erddap.ifremer.fr/erddap/tabledap/"
    "OceanGlidersGDACTrajectories.csv?platform_deployment,time,latitude,longitude,"
    "PRES,TEMP,PSAL&platform_deployment=%22Humpback_504%22&"
    "time%3E=2016-07-19T00:00:00Z"
)
CTX = ssl.create_default_context(cafile=certifi.where())


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "OceanScope/1.0"})
    with urllib.request.urlopen(request, timeout=180, context=CTX) as response:
        return response.read()


def number(value):
    try:
        result = float(value)
        return result if np.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def bgc_profile(wmo):
    url = f"{BGC_ROOT}/{wmo}/{wmo}_Sprof.nc"
    with tempfile.NamedTemporaryFile(suffix=".nc") as handle:
        handle.write(download(url)); handle.flush()
        ds = xr.open_dataset(handle.name, decode_times=False)
        lat = np.asarray(ds.LATITUDE.values, float)
        lon = np.asarray(ds.LONGITUDE.values, float)
        regional = np.where(np.isfinite(lat) & np.isfinite(lon) & (lat >= 5) & (lat <= 25) & (lon >= 65) & (lon <= 97))[0]
        selected = next((int(i) for i in regional[::-1] if "CHLA" in ds and np.isfinite(np.asarray(ds.CHLA.isel(N_PROF=i).values, float)).any()), None)
        if selected is None:
            return None
        pressure = "PRES_ADJUSTED" if "PRES_ADJUSTED" in ds else "PRES"
        names = {
            "temperature": "TEMP_ADJUSTED" if "TEMP_ADJUSTED" in ds else "TEMP",
            "salinity": "PSAL_ADJUSTED" if "PSAL_ADJUSTED" in ds else "PSAL",
            "chlorophyll": "CHLA_ADJUSTED" if "CHLA_ADJUSTED" in ds else "CHLA",
        }
        profile = []
        for level, depth in enumerate(np.asarray(ds[pressure].isel(N_PROF=selected).values, float)):
            if not np.isfinite(depth) or depth < 0:
                continue
            point = {"depth": round(float(depth), 2)}
            for target, source in names.items():
                if source in ds:
                    value = number(ds[source].isel(N_PROF=selected, N_LEVELS=level).values)
                    if value is not None:
                        point[target] = round(value, 4)
            if len(point) > 1:
                profile.append(point)
        variables = sorted({key for point in profile for key in point if key != "depth"})
        return {
            "id": f"bgc-{wmo}", "platform_number": wmo, "type": "bgc",
            "lat": round(float(lat[selected]), 4), "lon": round(float(lon[selected]), 4),
            "time": "Latest quality-controlled regional cycle", "max_depth": round(max(p["depth"] for p in profile), 1),
            "n_levels": len(profile), "variables": variables, "profile": profile,
            "source": "Argo GDAC / INCOIS DAC", "source_url": url,
        }


def glider_profile():
    rows = list(csv.DictReader(io.StringIO(download(GLIDER_URL).decode())))
    if rows and rows[0].get("time") == "UTC":
        rows = rows[1:]
    bins = {}
    for row in rows:
        depth, temp, sal = number(row.get("PRES")), number(row.get("TEMP")), number(row.get("PSAL"))
        if depth is None or depth < 0 or (temp is None and sal is None):
            continue
        bins.setdefault(int(round(depth / 5) * 5), []).append((temp, sal))
    profile = []
    for depth, values in sorted(bins.items()):
        point = {"depth": float(depth)}
        for index, name in enumerate(("temperature", "salinity")):
            available = [row[index] for row in values if row[index] is not None]
            if available:
                point[name] = round(float(np.mean(available)), 4)
        profile.append(point)
    if not profile:
        return None
    last = rows[-1]
    return {
        "id": "glider-Humpback_504", "platform_number": "Humpback_504", "type": "glider",
        "lat": round(float(last["latitude"]), 4), "lon": round(float(last["longitude"]), 4), "time": last["time"],
        "max_depth": max(p["depth"] for p in profile), "n_levels": len(profile),
        "variables": ["temperature", "salinity"], "profile": profile,
        "source": "OceanGliders GDAC / IFREMER", "source_url": GLIDER_URL,
    }


def main():
    instruments = []
    for wmo in BGC_FLOATS:
        print(f"fetching BGC-Argo {wmo}...")
        item = bgc_profile(wmo)
        if item:
            instruments.append(item)
    print("fetching OceanGliders Humpback_504...")
    item = glider_profile()
    if item:
        instruments.append(item)
    OUT.write_text(json.dumps(instruments, indent=1))
    print(f"wrote {len(instruments)} real instruments to {OUT}")


if __name__ == "__main__":
    main()
