"""Compare nested JSON and binary volume payload size for the demo dataset."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import ocean  # noqa: E402


def main():
    ocean.load()
    payload = ocean.get_volume(variable="temperature", timestep=0)
    json_bytes = len(json.dumps(payload, separators=(",", ":")).encode())
    binary = ocean.get_binary_volume(
        variable="temperature", timestep=0,
        lat_min=None, lat_max=None, lon_min=None, lon_max=None,
        depth_min=None, depth_max=None, stride=1,
    )
    binary_bytes = len(binary.body)
    print(f"nested JSON: {json_bytes / 1024:.1f} KiB")
    print(f"Float32:     {binary_bytes / 1024:.1f} KiB")
    print(f"reduction:   {json_bytes / binary_bytes:.2f}x")


if __name__ == "__main__":
    main()
