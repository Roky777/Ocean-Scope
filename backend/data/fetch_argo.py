"""
Fetch REAL Argo float positions and depth profiles from INCOIS.

Source: INCOIS ERDDAP, https://erddap.incois.gov.in/erddap
Dataset: Indian_ARGO_Floats ("INDIAN ARGO Floats Data")

This is INCOIS's own Argo float archive — the data behind their public Argo
viewer at services.incois.gov.in/argo/. Real observational profiles from the
Argo Program, with pressure, temperature and salinity per level.

NO ACCOUNT OR API KEY IS REQUIRED.

Each selected float contributes one real profile cycle from the surface down to
~1000 m. Floats are picked for profile completeness, then spread out
geographically so the markers are not clustered in one corner of the basin.

Output: backend/data/argo_profiles.json
"""

import json
import ssl
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

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

OUT = Path(__file__).parent / "argo_profiles.json"

BASE = "https://erddap.incois.gov.in/erddap/tabledap/Indian_ARGO_Floats.json"

# Match the final monthly model analyses instead of mixing observations from a
# different climate period into the evidence workflow.
START, END = "2019-02-01T00:00:00Z", "2019-04-01T00:00:00Z"

# Same bounds as the ocean grid, so every marker falls inside the scene.
from region import LAT_MIN, LAT_MAX, LON_MIN, LON_MAX  # noqa: E402

QUERY = (
    "?PLATFORM_NUMBER%2CCYCLE_NUMBER%2Clatitude%2Clongitude%2Ctime%2C"
    "PRES%2CPRES_QC%2CPRES_ADJUSTED%2CPRES_ADJUSTED_QC%2C"
    "TEMP%2CTEMP_QC%2CTEMP_ADJUSTED%2CTEMP_ADJUSTED_QC%2C"
    "PSAL%2CPSAL_QC%2CPSAL_ADJUSTED%2CPSAL_ADJUSTED_QC"
    f"&longitude%3E={LON_MIN}&longitude%3C={LON_MAX}"
    f"&latitude%3E={LAT_MIN}&latitude%3C={LAT_MAX}"
    "&PRES%3C=1000"
    f"&time%3E={START}&time%3C={END}"
)

N_FLOATS = 10
MAX_LEVELS = 80       # subsample each profile to keep the JSON small
MIN_SEPARATION = 3.5  # degrees (lat+lon), so markers spread across the region


def download():
    with urllib.request.urlopen(BASE + QUERY, timeout=300, context=SSL_CTX) as r:
        return json.load(r)["table"]


def build_profiles(table):
    """Group rows into one profile per (float, cycle time)."""
    col = {n: i for i, n in enumerate(table["columnNames"])}
    cycles = defaultdict(list)

    for row in table["rows"]:
        adjusted_pres = row[col["PRES_ADJUSTED"]] if str(row[col["PRES_ADJUSTED_QC"]]).strip() in {"1", "2"} else None
        adjusted_temp = row[col["TEMP_ADJUSTED"]] if str(row[col["TEMP_ADJUSTED_QC"]]).strip() in {"1", "2"} else None
        adjusted_sal = row[col["PSAL_ADJUSTED"]] if str(row[col["PSAL_ADJUSTED_QC"]]).strip() in {"1", "2"} else None
        pres = adjusted_pres if adjusted_pres is not None else row[col["PRES"]]
        temp = adjusted_temp if adjusted_temp is not None else row[col["TEMP"]]
        sal = adjusted_sal if adjusted_sal is not None else row[col["PSAL"]]
        if pres is None or temp is None or pres < 0:
            continue
        pid = (row[col["PLATFORM_NUMBER"]] or "").strip()
        if not pid:
            continue
        cycles[(pid, row[col["CYCLE_NUMBER"]], row[col["time"]])].append(
            (
                float(pres),
                float(temp),
                sal,
                row[col["latitude"]],
                row[col["longitude"]],
                row[col["PRES_ADJUSTED_QC"]] if adjusted_pres is not None else row[col["PRES_QC"]],
                row[col["TEMP_ADJUSTED_QC"]] if adjusted_temp is not None else row[col["TEMP_QC"]],
                row[col["PSAL_ADJUSTED_QC"]] if adjusted_sal is not None else row[col["PSAL_QC"]],
                adjusted_pres is not None,
                adjusted_temp is not None,
                adjusted_sal is not None,
            )
        )

    # Deepest-sampled cycle per float.
    best = {}
    for (pid, cycle, when), levels in cycles.items():
        if pid not in best or len(levels) > len(best[pid][1]):
            best[pid] = (when, levels, cycle)

    profiles = []
    for pid, (when, levels, cycle) in best.items():
        levels.sort(key=lambda x: x[0])
        if len(levels) < 10:
            continue
        if len(levels) > MAX_LEVELS:
            idx = sorted({round(i * (len(levels) - 1) / (MAX_LEVELS - 1))
                          for i in range(MAX_LEVELS)})
            levels = [levels[i] for i in idx]

        profile_rows = [
                    {
                        "depth": round(p, 1),
                        "temperature": round(t, 3),
                        "salinity": round(s, 3) if s is not None else None,
                        "pressure_qc": str(p_qc).strip() if p_qc is not None else None,
                        "temperature_qc": str(t_qc).strip() if t_qc is not None else None,
                        "salinity_qc": str(s_qc).strip() if s_qc is not None else None,
                        "adjusted": {"pressure": bool(p_adj), "temperature": bool(t_adj), "salinity": bool(s_adj)},
                    }
                    for p, t, s, _, _, p_qc, t_qc, s_qc, p_adj, t_adj, s_adj in levels
                ]
        first_good = next((point for point in profile_rows if point["temperature_qc"] in {"1", "2"}), profile_rows[0])
        profiles.append(
            {
                "id": f"argo-{pid}",
                "platform_number": pid,
                "cycle_number": cycle,
                "lat": round(levels[0][3], 4),
                "lon": round(levels[0][4], 4),
                "time": when,
                "surface_temperature": first_good["temperature"],
                "max_depth": round(levels[-1][0], 1),
                "n_levels": len(levels),
                # depth here is pressure in decibar, ~= metres in the upper ocean
                "profile": profile_rows,
                "source": "real",
                "source_name": "INCOIS ERDDAP Indian_ARGO_Floats",
                "qc_convention": "Argo reference table 2",
            }
        )
    return profiles


def spread_out(profiles):
    """Greedily keep deep, well-separated floats."""
    profiles.sort(key=lambda f: -f["n_levels"])
    picked = []
    for f in profiles:
        if all(
            abs(f["lat"] - g["lat"]) + abs(f["lon"] - g["lon"]) >= MIN_SEPARATION
            for g in picked
        ):
            picked.append(f)
        if len(picked) == N_FLOATS:
            break
    for f in profiles:  # top up if separation was too strict
        if len(picked) >= N_FLOATS:
            break
        if f not in picked:
            picked.append(f)
    return sorted(picked, key=lambda f: f["id"])


def main():
    print("downloading Argo profiles from INCOIS ERDDAP...")
    try:
        table = download()
    except Exception as exc:  # noqa: BLE001
        print(
            f"FAILED: {exc}\n"
            "No synthetic fallback is written — this prototype serves only real "
            "Argo data. Retry when INCOIS ERDDAP is reachable.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    profiles = spread_out(build_profiles(table))
    if not profiles:
        print("No usable profiles in the requested window.", file=sys.stderr)
        raise SystemExit(1)

    OUT.write_text(json.dumps(profiles, indent=1))
    print(f"wrote {OUT}  ({OUT.stat().st_size // 1024} KB)  {len(profiles)} floats")
    for f in profiles:
        salt = sum(1 for p in f["profile"] if p["salinity"] is not None)
        print(
            f"  {f['id']:16s} ({f['lat']:7.2f}, {f['lon']:7.2f})  "
            f"{f['n_levels']:3d} levels to {f['max_depth']:6.1f} m  "
            f"SST {f['surface_temperature']:5.2f}  psal {salt}"
        )


if __name__ == "__main__":
    main()
