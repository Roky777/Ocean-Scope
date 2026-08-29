"""Source-adapter registry and validated NetCDF/CSV instrument ingestion."""

from __future__ import annotations

import csv
import io
import json
import math
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import xarray as xr


class IngestionError(ValueError):
    pass


@dataclass(frozen=True)
class SourceAdapter:
    id: str
    formats: tuple[str, ...]
    description: str
    parser: Callable


ADAPTERS: dict[str, SourceAdapter] = {}


def register(adapter: SourceAdapter) -> None:
    ADAPTERS[adapter.id] = adapter


ALIASES = {
    "id": ("id", "platform_id", "platform_number", "station", "instrument_id"),
    "lat": ("lat", "latitude"), "lon": ("lon", "longitude"),
    "depth": ("depth", "pressure", "pres"), "time": ("time", "timestamp", "date", "datetime"),
    "temperature": ("temperature", "temp", "TEMP"),
    "salinity": ("salinity", "psal", "PSAL"),
    "chlorophyll": ("chlorophyll", "chlorophyll_a", "chla", "CHLA"),
}


def _mapping(headers: list[str], supplied: dict[str, str] | None) -> dict[str, str]:
    lower = {h.lower(): h for h in headers}
    out = dict(supplied or {})
    for target, names in ALIASES.items():
        if target in out:
            continue
        for name in names:
            if name.lower() in lower:
                out[target] = lower[name.lower()]
                break
    missing = [x for x in ("lat", "lon", "depth") if x not in out]
    if missing:
        raise IngestionError(f"Missing required columns: {', '.join(missing)}. Supply a column mapping.")
    return out


def _number(value: str, name: str, row: int) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise IngestionError(f"Row {row}: invalid {name} value {value!r}") from exc
    if not math.isfinite(result):
        raise IngestionError(f"Row {row}: {name} must be finite")
    return result


def parse_delimited(blob: bytes, *, instrument_type: str, mapping: dict[str, str] | None = None, delimiter: str | None = None) -> list[dict]:
    try:
        text = blob.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise IngestionError("Text files must be UTF-8 encoded") from exc
    sample = text[:4096]
    delim = delimiter or csv.Sniffer().sniff(sample, delimiters=",\t;|").delimiter
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    if not reader.fieldnames:
        raise IngestionError("The file has no header row")
    columns = _mapping(reader.fieldnames, mapping)
    grouped: dict[str, dict] = {}
    for row_no, row in enumerate(reader, 2):
        lat = _number(row.get(columns["lat"], ""), "latitude", row_no)
        lon = _number(row.get(columns["lon"], ""), "longitude", row_no)
        depth = _number(row.get(columns["depth"], ""), "depth", row_no)
        if not -90 <= lat <= 90 or not -180 <= lon <= 180 or depth < 0:
            raise IngestionError(f"Row {row_no}: coordinates/depth are outside valid ranges")
        ident = row.get(columns.get("id", ""), "").strip() or f"{instrument_type}-import-1"
        item = grouped.setdefault(ident, {"id": ident, "type": instrument_type, "lat": lat, "lon": lon, "time": "", "profile": []})
        if columns.get("time"):
            item["time"] = row.get(columns["time"], "").strip()
        point = {"depth": depth}
        for variable in ("temperature", "salinity", "chlorophyll"):
            source = columns.get(variable)
            if source and row.get(source, "").strip():
                point[variable] = _number(row[source], variable, row_no)
        if len(point) == 1:
            raise IngestionError(f"Row {row_no}: no supported measured variable was found")
        item["profile"].append(point)
    if not grouped:
        raise IngestionError("The file contains no data rows")
    for item in grouped.values():
        item["profile"].sort(key=lambda p: p["depth"])
        item["max_depth"] = max(p["depth"] for p in item["profile"])
        item["n_levels"] = len(item["profile"])
        item["variables"] = sorted({k for p in item["profile"] for k in p if k != "depth"})
    return list(grouped.values())


def validate_netcdf(blob: bytes) -> dict:
    with tempfile.NamedTemporaryFile(suffix=".nc") as handle:
        handle.write(blob); handle.flush()
        try:
            ds = xr.open_dataset(handle.name)
        except Exception as exc:
            raise IngestionError(f"Cannot read NetCDF: {exc}") from exc
        coords = set(ds.coords) | set(ds.dims)
        missing = [c for c in ("time",) if c not in coords]
        has_lat = bool(coords & {"lat", "latitude"}); has_lon = bool(coords & {"lon", "longitude"})
        if missing or not has_lat or not has_lon:
            raise IngestionError("NetCDF requires time, latitude/lat and longitude/lon coordinates")
        return {"dimensions": dict(ds.sizes), "variables": list(ds.data_vars), "conventions": ds.attrs.get("Conventions", "not declared")}


register(SourceAdapter("delimited-profile", ("csv", "tsv", "txt"), "CSV/ASCII depth profiles with configurable columns", parse_delimited))
register(SourceAdapter("cf-netcdf", ("nc", "netcdf"), "CF-style gridded or profile NetCDF", validate_netcdf))


def adapter_manifest() -> list[dict]:
    return [{"id": a.id, "formats": list(a.formats), "description": a.description} for a in ADAPTERS.values()]
