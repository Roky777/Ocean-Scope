"""Dataset configuration, uploads, unified instruments, and basic OGC access."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from urllib.parse import urlencode

import numpy as np
import xarray as xr
from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import Response

from . import ocean
from .catalog import variable_catalog
from .ingestion import ADAPTERS, IngestionError, adapter_manifest, parse_delimited, validate_netcdf

router = APIRouter()
IMPORT_DIR = Path(__file__).parent.parent / "data" / "imports"
INSTRUMENTS_PATH = Path(__file__).parent.parent / "data" / "instrument_profiles.json"
INSTRUMENT_TYPES = {"argo", "glider", "ctd", "bgc"}
_imports: list[dict] = []
_opendap_sources: list[dict] = []
_uploaded_datasets: list[dict] = []

if INSTRUMENTS_PATH.exists():
    try:
        _imports.extend(json.loads(INSTRUMENTS_PATH.read_text()))
    except (OSError, json.JSONDecodeError):
        pass


def _all_instruments() -> list[dict]:
    argo = [{**item, "type": item.get("type", "argo"), "variables": item.get("variables", ["temperature", "salinity"])} for item in (ocean._profiles or [])]
    return argo + _imports


@router.get("/api/adapters")
def adapters():
    return {"adapters": adapter_manifest(), "instrument_types": sorted(INSTRUMENT_TYPES)}


@router.get("/api/instruments")
def instruments(type: str | None = Query(None), variable: str | None = Query(None)):
    if type and type not in INSTRUMENT_TYPES:
        raise HTTPException(400, f"Unknown instrument type {type!r}")
    rows = _all_instruments()
    if type: rows = [r for r in rows if r["type"] == type]
    if variable: rows = [r for r in rows if variable in r.get("variables", [])]
    counts = {kind: sum(r["type"] == kind for r in rows) for kind in sorted(INSTRUMENT_TYPES)}
    return {"count": len(rows), "counts": counts, "instruments": rows}


@router.post("/api/import/instruments")
async def import_instruments(
    payload: bytes = Body(..., media_type="application/octet-stream"),
    instrument_type: str = Query(...), column_mapping: str = Query("{}"),
    delimiter: str | None = Query(None), filename: str = Query("upload.csv"),
):
    if instrument_type not in INSTRUMENT_TYPES:
        raise HTTPException(422, f"instrument_type must be one of {sorted(INSTRUMENT_TYPES)}")
    blob = payload
    if len(blob) > 20 * 1024 * 1024:
        raise HTTPException(413, "Upload exceeds the 20 MB limit")
    try:
        mapping = json.loads(column_mapping)
        rows = parse_delimited(blob, instrument_type=instrument_type, mapping=mapping, delimiter=delimiter or None)
    except (IngestionError, json.JSONDecodeError, csv.Error) as exc:
        raise HTTPException(422, str(exc)) from exc
    _imports.extend(rows)
    return {"accepted": len(rows), "instruments": rows, "warnings": []}


@router.post("/api/import/validate-netcdf")
async def validate_uploaded_netcdf(payload: bytes = Body(..., media_type="application/octet-stream")):
    blob = payload
    if len(blob) > 100 * 1024 * 1024:
        raise HTTPException(413, "Upload exceeds the 100 MB validation limit")
    try: return {"valid": True, **validate_netcdf(blob)}
    except IngestionError as exc: raise HTTPException(422, str(exc)) from exc


@router.get("/api/datasets")
def datasets():
    return {"datasets": _uploaded_datasets, "opendap_sources": _opendap_sources}


@router.post("/api/import/datasets")
async def import_dataset(
    payload: bytes = Body(..., media_type="application/octet-stream"),
    filename: str = Query("dataset.nc"), activate: bool = Query(False),
):
    """Validate and register a CF-style NetCDF dataset.

    Activation is intentionally explicit: an uploaded file never silently
    replaces the operational dataset used by active users.
    """
    if len(payload) > 100 * 1024 * 1024:
        raise HTTPException(413, "Upload exceeds the 100 MB import limit")
    try:
        metadata = validate_netcdf(payload)
    except IngestionError as exc:
        raise HTTPException(422, str(exc)) from exc
    safe_name = Path(filename).name
    if not safe_name.lower().endswith((".nc", ".netcdf")):
        raise HTTPException(422, "Dataset filename must end in .nc or .netcdf")
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
    destination = IMPORT_DIR / safe_name
    destination.write_bytes(payload)
    record = {"id": len(_uploaded_datasets) + 1, "filename": safe_name, **metadata, "active": False}
    _uploaded_datasets.append(record)
    if activate:
        # Runtime activation avoids modifying the bundled source snapshot.
        ds = xr.open_dataset(destination)
        ocean._ds = ds
        ocean.VARIABLES.clear(); ocean.VARIABLES.update(variable_catalog(ds))
        ocean._ranges.clear()
        for name in ocean.VARIABLES:
            da = ds[name]
            if "depth" in da.dims:
                ocean._ranges[name] = {"global": ocean._minmax(da.values), "by_depth": {float(d): ocean._minmax(da.isel(depth=i).values) for i, d in enumerate(ds["depth"].values)}}
            else:
                value_range = ocean._minmax(da.values)
                ocean._ranges[name] = {"global": value_range, "by_depth": {}}
        record["active"] = True
    return record


@router.get("/api/opendap/sources")
def opendap_sources(): return {"sources": _opendap_sources}


@router.post("/api/opendap/sources")
def configure_opendap(url: str = Query(...), name: str = Query("OPeNDAP source")):
    if not url.startswith(("https://", "http://")):
        raise HTTPException(422, "OPeNDAP URL must use HTTP or HTTPS")
    source = {"id": len(_opendap_sources) + 1, "name": name.strip() or "OPeNDAP source", "url": url, "status": "configured"}
    _opendap_sources.append(source)
    return source


def _field(variable: str, depth: float | None, timestep: int):
    return ocean.get_field(variable=variable, depth=depth, timestep=timestep)


@router.get("/ogc/wms")
def wms(request: str = Query("GetCapabilities"), layers: str = Query("temperature"), timestep: int = 0, depth: float | None = None):
    if request.lower() == "getcapabilities":
        ds = ocean._require_dataset(); catalog = variable_catalog(ds)
        layer_xml = "".join(f"<Layer><Name>{v['id']}</Name><Title>{v['label']}</Title></Layer>" for v in catalog.values())
        xml = f'<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Service><Name>WMS</Name><Title>OceanScope</Title></Service><Capability><Layer>{layer_xml}</Layer></Capability></WMS_Capabilities>'
        return Response(xml, media_type="application/xml")
    if request.lower() != "getmap": raise HTTPException(400, "REQUEST must be GetCapabilities or GetMap")
    field = _field(layers, depth, timestep); values = np.asarray(field["values"], dtype=float)
    lo, hi = field["range"]["min"], field["range"]["max"]
    cells = []
    for y, row in enumerate(values):
        for x, value in enumerate(row):
            if not np.isfinite(value): continue
            t = max(0, min(1, (value - lo) / (hi - lo or 1))); color = f"rgb({int(255*t)},{int(210*(1-abs(t-.5)*2))},{int(255*(1-t))})"
            cells.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {values.shape[1]} {values.shape[0]}" shape-rendering="crispEdges">{"".join(cells)}</svg>'
    return Response(svg, media_type="image/svg+xml", headers={"Content-Disposition": f'inline; filename="{layers}.svg"'})


@router.get("/ogc/wcs")
def wcs(request: str = Query("GetCapabilities"), coverageid: str = Query("temperature"), timestep: int = 0, depth: float | None = None):
    if request.lower() == "getcapabilities":
        catalog = variable_catalog(ocean._require_dataset())
        xml = '<?xml version="1.0"?><wcs:Capabilities xmlns:wcs="http://www.opengis.net/wcs/2.0">' + "".join(f'<wcs:CoverageSummary><wcs:CoverageId>{v}</wcs:CoverageId></wcs:CoverageSummary>' for v in catalog) + '</wcs:Capabilities>'
        return Response(xml, media_type="application/xml")
    if request.lower() != "getcoverage": raise HTTPException(400, "REQUEST must be GetCapabilities or GetCoverage")
    return _field(coverageid, depth, timestep)
