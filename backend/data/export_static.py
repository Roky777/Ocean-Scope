"""
Pre-render the whole API to static JSON.

The backend serves a FIXED local NetCDF snapshot, so every endpoint is
deterministic: given the same data file, /api/field always returns the same
bytes for the same query. That means the entire API can be baked into static
files and served by any CDN with no Python process at all.

This is what makes the Vercel deployment work end to end. Vercel hosts the
built frontend; these files sit beside it and the frontend fetches them
directly. No backend host, no cold starts, no CORS.

Output: frontend/public/api-static/
    meta.json
    floats.json
    field/<variable>/<depth>/<timestep>.json

Run it after any change to the dataset or to the API's response shape:

    backend/venv/bin/python backend/data/export_static.py

(Directory is api-static/ rather than api/ so it can never be confused with
Vercel's serverless-function convention for a top-level api/ directory.)
"""

import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app import ocean  # noqa: E402  (needs the path set up first)

OUT = ROOT / "frontend" / "public" / "api-static"


def depth_key(d: float) -> str:
    """Match how JavaScript stringifies the depth: 5.0 -> '5'."""
    return str(int(d)) if float(d).is_integer() else str(d)


def write(path: Path, payload) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    blob = json.dumps(payload, separators=(",", ":"))
    path.write_text(blob)
    return len(blob)


def main() -> None:
    ocean.load()

    if OUT.exists():
        shutil.rmtree(OUT)  # stale slices must not survive a shape change

    total = 0
    total += write(OUT / "meta.json", ocean.get_meta())
    meta = ocean.get_meta()

    try:
        total += write(OUT / "floats.json", ocean.get_floats())
    except Exception as exc:  # noqa: BLE001
        print(f"  floats unavailable ({exc}) - run fetch_argo.py first", file=sys.stderr)

    # Hazard grids, one per timestep.
    from app import hazard as hazard_mod

    for t in range(len(meta["timesteps"])):
        total += write(OUT / "hazard" / f"{t}.json", hazard_mod.get_hazard(timestep=t))
        total += write(OUT / "currents" / f"{t}.json", ocean.get_currents(timestep=t, stride=3))

    for lead in (1, 2, 3):
        total += write(OUT / "forecast" / f"{lead}.json", ocean.get_forecast(lead=lead))

    variables = [v["id"] for v in meta["variables"] if v.get("available")]
    volume_variables = [v["id"] for v in meta["variables"] if v.get("available") and not v.get("surface")]
    depths = meta["depths"]
    n_time = len(meta["timesteps"])

    count = 0
    for var in volume_variables:
        for t in range(n_time):
            total += write(OUT / "volume" / var / f"{t}.json", ocean.get_volume(variable=var, timestep=t))
    for var in variables:
        for d in depths:
            for t in range(n_time):
                payload = ocean.get_field(variable=var, depth=d, timestep=t)
                total += write(
                    OUT / "field" / var / depth_key(d) / f"{t}.json", payload
                )
                count += 1

    print(
        f"wrote {count} slices + volumes + currents + forecast + hazard + meta + floats to {OUT.relative_to(ROOT)}\n"
        f"  variables={variables} depths={depths} timesteps={n_time}\n"
        f"  total {total / 1024:.0f} KB"
    )


if __name__ == "__main__":
    main()
