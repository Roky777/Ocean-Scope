"""Transparent model-to-observation collocation for the Feature → Evidence flow."""

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from math import asin, cos, radians, sin, sqrt

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import ocean
from .data_access import _all_instruments
from .scientific import horizontal_profile

router = APIRouter(prefix="/api/evidence", tags=["evidence"])


class EvidenceConfig(BaseModel):
    # The model is monthly. A 45-day window and 250-km radius are explicit,
    # conservative prototype defaults; scientists can tighten either in the UI.
    radius_km: float = Field(250, gt=0, le=2000)
    time_window_hours: float = Field(1080, gt=0, le=24 * 365 * 10)
    minimum_depth_overlap_ratio: float = Field(0.30, ge=0, le=1)
    accepted_qc: tuple[str, ...] = ("1", "2")


DEFAULT_CONFIG = EvidenceConfig()


class SearchRequest(BaseModel):
    dataset: str = "incois_argo_mnt_VAM"
    variable: str = "temperature"
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    depth_min: float = Field(ge=0)
    depth_max: float = Field(ge=0)
    timestep: int = Field(ge=0)
    radius_km: float = Field(DEFAULT_CONFIG.radius_km, gt=0, le=2000)
    time_window_hours: float = Field(DEFAULT_CONFIG.time_window_hours, gt=0, le=24 * 365 * 10)
    minimum_depth_overlap_ratio: float = Field(DEFAULT_CONFIG.minimum_depth_overlap_ratio, ge=0, le=1)


class CollocateRequest(BaseModel):
    dataset: str = "incois_argo_mnt_VAM"
    variable: str = "temperature"
    observation_id: str
    timestep: int = Field(ge=0)
    accepted_qc: tuple[str, ...] = DEFAULT_CONFIG.accepted_qc


def _utc(value) -> datetime:
    text = str(value).replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def _iso(value) -> str:
    return np.datetime_as_string(np.datetime64(value), unit="s") + "Z"


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = radians(lat1), radians(lat2)
    dp, dl = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(a))


def _variable_qc(point: dict, variable: str) -> str | None:
    flags = [point.get(f"{variable}_qc"), point.get("pressure_qc")]
    flags = [str(value).strip() for value in flags if value not in (None, "", " ")]
    if not flags:
        return None
    if any(value not in DEFAULT_CONFIG.accepted_qc for value in flags):
        return next(value for value in flags if value not in DEFAULT_CONFIG.accepted_qc)
    return "2" if "2" in flags else "1"


def _valid_points(profile: dict, variable: str, accepted_qc: tuple[str, ...]) -> tuple[list[dict], dict]:
    accepted, good, probably_good, rejected, unavailable = [], 0, 0, 0, 0
    for point in profile.get("profile", []):
        value, depth = point.get(variable), point.get("depth")
        if value is None or depth is None or not np.isfinite(float(value)) or not np.isfinite(float(depth)):
            rejected += 1
            continue
        flag = _variable_qc(point, variable)
        if flag is None:
            unavailable += 1
            accepted.append(point)
        elif flag in accepted_qc:
            accepted.append(point)
            good += flag == "1"
            probably_good += flag == "2"
        else:
            rejected += 1
    return accepted, {
        "good": good,
        "probably_good": probably_good,
        "rejected": rejected,
        "metadata_unavailable": unavailable,
        "policy": f"Accepted Argo QC {', '.join(accepted_qc)}; finite values retained when QC metadata is absent",
    }


def _depth_overlap(points: list[dict], low: float, high: float) -> tuple[float, list[float]]:
    if not points or high <= low:
        return 0.0, []
    depths = [float(p["depth"]) for p in points]
    common_low, common_high = max(low, min(depths)), min(high, max(depths))
    overlap = max(0.0, common_high - common_low)
    ratio = overlap / (high - low)
    return ratio, [round(common_low, 2), round(common_high, 2)] if overlap > 0 else []


def _model_time(timestep: int):
    ds = ocean._require_dataset()
    if timestep >= ds.sizes["time"]:
        raise HTTPException(404, f"No data for timestep {timestep}")
    return ds["time"].values[timestep]


@router.get("/config")
def config():
    return {
        **DEFAULT_CONFIG.model_dump(),
        "ranking_weights": {"space": 0.30, "time": 0.25, "depth_overlap": 0.25, "qc": 0.20},
        "score_label": "Observation match score",
        "note": "Ranking describes collocation suitability, not model correctness.",
    }


@router.post("/search")
def search(request: SearchRequest):
    if request.depth_max <= request.depth_min:
        raise HTTPException(422, "depth_max must be greater than depth_min")
    if request.variable not in ("temperature", "salinity"):
        raise HTTPException(422, "Evidence comparison currently supports temperature and salinity")

    target_time = _utc(_model_time(request.timestep))
    candidates = []
    for profile in _all_instruments():
        if request.variable not in profile.get("variables", ["temperature", "salinity"]):
            continue
        try:
            observed_time = _utc(profile["time"])
        except (KeyError, TypeError, ValueError):
            continue
        distance = haversine_km(request.lat, request.lon, profile["lat"], profile["lon"])
        hours = abs((observed_time - target_time).total_seconds()) / 3600
        valid, summary = _valid_points(profile, request.variable, DEFAULT_CONFIG.accepted_qc)
        overlap, common = _depth_overlap(valid, request.depth_min, request.depth_max)
        if distance > request.radius_km or hours > request.time_window_hours or overlap < request.minimum_depth_overlap_ratio:
            continue
        qc_known = summary["good"] + summary["probably_good"] + summary["rejected"]
        qc_score = ((summary["good"] + 0.75 * summary["probably_good"]) / qc_known) if qc_known else 0.5
        components = {
            "space": max(0.0, 1 - distance / request.radius_km),
            "time": max(0.0, 1 - hours / request.time_window_hours),
            "depth_overlap": overlap,
            "qc": qc_score,
        }
        score = 0.30 * components["space"] + 0.25 * components["time"] + 0.25 * overlap + 0.20 * qc_score
        candidates.append({
            "id": profile["id"], "platform_id": profile.get("platform_number", profile["id"]),
            "cycle_id": profile.get("cycle_number"), "platform_type": profile.get("type", "argo"),
            "lat": profile["lat"], "lon": profile["lon"], "time": profile["time"],
            "distance_km": round(distance, 1), "time_gap_hours": round(hours, 1),
            "depth_overlap_ratio": round(overlap, 3), "common_depth_range": common,
            "valid_levels": len(valid), "qc_summary": summary,
            "match_score": round(score, 3),
            "match_components": {key: round(value, 3) for key, value in components.items()},
        })
    candidates.sort(key=lambda item: (-item["match_score"], item["distance_km"]))
    return {
        "selection": {"lat": request.lat, "lon": request.lon, "depth_range": [request.depth_min, request.depth_max], "model_time": _iso(_model_time(request.timestep))},
        "search": {"radius_km": request.radius_km, "time_window_hours": request.time_window_hours, "minimum_depth_overlap_ratio": request.minimum_depth_overlap_ratio},
        "count": len(candidates), "candidates": candidates,
        "score_note": "Match score ranks observation suitability from space, time, depth overlap and QC; it does not measure model accuracy.",
    }


def _time_profile(data, times: np.ndarray, observed_time: np.datetime64):
    exact = np.flatnonzero(times == observed_time)
    if exact.size:
        index = int(exact[0])
        return np.asarray(data.isel(time=index).values, float), index, index, "exact_timestep"
    if observed_time < times[0]:
        return np.asarray(data.isel(time=0).values, float), 0, 0, "nearest_timestep"
    if observed_time > times[-1]:
        i = len(times) - 1
        return np.asarray(data.isel(time=i).values, float), i, i, "nearest_timestep"
    right = int(np.searchsorted(times, observed_time, side="right"))
    left = right - 1
    span = float((times[right] - times[left]) / np.timedelta64(1, "s"))
    weight = float((observed_time - times[left]) / np.timedelta64(1, "s")) / span
    values = (1 - weight) * np.asarray(data.isel(time=left).values, float) + weight * np.asarray(data.isel(time=right).values, float)
    return values, left, right, "linear_time_interpolation"


def _bootstrap_confidence_intervals(model_values: np.ndarray, observed_values: np.ndarray, samples: int = 2000) -> dict:
    """Deterministic paired-profile bootstrap; omitted for undersized profiles."""
    model_values, observed_values = np.asarray(model_values, float), np.asarray(observed_values, float)
    n = len(model_values)
    if n < 4:
        return {}
    rng = np.random.default_rng(26067)
    indices = rng.integers(0, n, size=(samples, n))
    errors = model_values[indices] - observed_values[indices]
    statistics = {
        "bias": errors.mean(axis=1),
        "mae": np.abs(errors).mean(axis=1),
        "rmse": np.sqrt(np.mean(errors ** 2, axis=1)),
    }
    return {
        name: [round(float(v), 4) for v in np.percentile(values, [2.5, 97.5])]
        for name, values in statistics.items()
    }


def _metrics(model_values: np.ndarray, observed_values: np.ndarray) -> dict:
    error = np.asarray(model_values, float) - np.asarray(observed_values, float)
    result = {
        "bias": round(float(error.mean()), 4),
        "mae": round(float(np.abs(error).mean()), 4),
        "rmse": round(float(np.sqrt(np.mean(error ** 2))), 4),
        "matched_samples": len(error),
        "confidence_intervals_95": _bootstrap_confidence_intervals(model_values, observed_values),
    }
    if len(error) >= 3 and np.std(observed_values) > 0 and np.std(model_values) > 0:
        result["correlation"] = round(float(np.corrcoef(model_values, observed_values)[0, 1]), 4)
    return result


def _comparison_confidence(spatial_footprint_km: float, time_gap_hours: float, matched: int, qc_summary: dict) -> dict:
    """Rate matchup representativeness separately from numerical model skill."""
    known = qc_summary["good"] + qc_summary["probably_good"] + qc_summary["rejected"]
    qc = (qc_summary["good"] + 0.75 * qc_summary["probably_good"]) / known if known else 0.5
    components = {
        "spatial": float(np.exp(-spatial_footprint_km / 180.0)),
        "temporal": float(np.exp(-time_gap_hours / (24 * 45))),
        "sample_support": min(1.0, matched / 8.0),
        "qc": qc,
    }
    score = 0.30 * components["spatial"] + 0.30 * components["temporal"] + 0.25 * components["sample_support"] + 0.15 * components["qc"]
    label = "high" if score >= 0.75 else "moderate" if score >= 0.5 else "limited"
    return {
        "score": round(score, 3),
        "label": label,
        "components": {key: round(value, 3) for key, value in components.items()},
        "meaning": "Matchup representativeness from grid footprint, time gap, sample support, and QC. This is separate from model accuracy.",
    }


def _nearest_wet_cell(profile3d: np.ndarray, lats: np.ndarray, lons: np.ndarray, lat: float, lon: float):
    candidates = []
    for j, grid_lat in enumerate(lats):
        for i, grid_lon in enumerate(lons):
            valid = int(np.isfinite(profile3d[:, j, i]).sum())
            if valid:
                candidates.append((haversine_km(lat, lon, float(grid_lat), float(grid_lon)), -valid, j, i))
    if not candidates:
        raise HTTPException(422, "No valid wet model cell is available")
    return min(candidates)


@router.post("/collocate")
def collocate(request: CollocateRequest):
    ds = ocean._require_dataset()
    if request.variable not in ds or "depth" not in ds[request.variable].dims:
        raise HTTPException(422, f"{request.variable} has no depth-resolved model field")
    observation = next((p for p in _all_instruments() if p.get("id") == request.observation_id), None)
    if observation is None:
        raise HTTPException(404, "Observation profile not found")
    valid, qc_summary = _valid_points(observation, request.variable, request.accepted_qc)
    if not valid:
        raise HTTPException(422, "Observation has no values accepted by the QC policy")

    observed_time = np.datetime64(_utc(observation["time"]).replace(tzinfo=None))
    times = np.asarray(ds["time"].values, dtype="datetime64[ns]")
    timed, previous, following, time_method = _time_profile(ds[request.variable], times, observed_time)
    lats, lons = np.asarray(ds.lat), np.asarray(ds.lon)
    try:
        model_profile, space_method, grid_footprint_km, fallback_levels = horizontal_profile(
            timed, lats, lons, observation["lat"], observation["lon"],
        )
    except HTTPException:
        model_profile = np.full(timed.shape[0], np.nan)
        space_method, grid_footprint_km, fallback_levels = "outside_grid_fallback", 0.0, 0
    model_location = {"lat": round(float(observation["lat"]), 4), "lon": round(float(observation["lon"]), 4)}
    distance = 0.0
    if np.isfinite(model_profile).sum() < 2:
        distance, _, lat_index, lon_index = _nearest_wet_cell(timed, lats, lons, observation["lat"], observation["lon"])
        model_profile = timed[:, lat_index, lon_index]
        model_location = {"lat": round(float(ds.lat.values[lat_index]), 4), "lon": round(float(ds.lon.values[lon_index]), 4)}
        space_method = "nearest_valid_wet_cell"
        grid_footprint_km = round(distance, 2)
        fallback_levels = int(len(model_profile))
    model_depths = np.asarray(ds.depth.values, float)
    model_valid = np.isfinite(model_profile)
    if model_valid.sum() < 2:
        raise HTTPException(422, "Matched wet cell has insufficient model depth coverage")

    obs_depths = np.asarray([float(p["depth"]) for p in valid], float)
    obs_values = np.asarray([float(p[request.variable]) for p in valid], float)
    within = (obs_depths >= model_depths[model_valid].min()) & (obs_depths <= model_depths[model_valid].max())
    aligned_depths, aligned_obs = obs_depths[within], obs_values[within]
    aligned_model = np.interp(aligned_depths, model_depths[model_valid], model_profile[model_valid])
    finite = np.isfinite(aligned_obs) & np.isfinite(aligned_model)
    aligned_depths, aligned_obs, aligned_model = aligned_depths[finite], aligned_obs[finite], aligned_model[finite]
    if not len(aligned_depths):
        raise HTTPException(422, "Observation and model profiles have no common valid depth range")
    nearest_gap = min(abs(observed_time - times[previous]), abs(times[following] - observed_time)) / np.timedelta64(1, "h")
    metrics = _metrics(aligned_model, aligned_obs)
    confidence = _comparison_confidence(grid_footprint_km, float(nearest_gap), len(aligned_depths), qc_summary)
    result = {
        "observation": {key: observation.get(key) for key in ("id", "platform_number", "cycle_number", "type", "lat", "lon", "time", "source")},
        "variable": request.variable, "units": ocean.VARIABLES[request.variable]["units"],
        "model_location": model_location,
        "spatial_distance_km": round(distance, 2), "space_method": space_method,
        "representativeness": {
            "grid_footprint_km": grid_footprint_km,
            "wet_corner_fallback_levels": fallback_levels,
            "note": "Grid footprint is a resolution/mismatch indicator, not instrument measurement uncertainty.",
        },
        "time_matching": {"method": time_method, "observation_time": observation["time"], "previous_model_time": _iso(times[previous]), "next_model_time": _iso(times[following]), "nearest_time_gap_hours": round(float(nearest_gap), 2)},
        "depth_matching": {"method": "linear_model_to_observation_depths", "common_depth_range": [round(float(aligned_depths.min()), 2), round(float(aligned_depths.max()), 2)], "valid_matched_depths": len(aligned_depths)},
        "qc_summary": qc_summary,
        "profile": [{"depth": round(float(d), 2), "observed": round(float(o), 4), "model": round(float(m), 4), "difference": round(float(m-o), 4)} for d, o, m in zip(aligned_depths, aligned_obs, aligned_model)],
        "metrics": metrics,
        "comparison_confidence": confidence,
        "provenance": ocean.provenance("model-observation collocation", request.timestep, request.variable, f"{space_method}; {time_method}; linear depth interpolation"),
        "provenance_trail": [
            {"step": 1, "action": "QC filter", "detail": qc_summary["policy"]},
            {"step": 2, "action": "Time alignment", "detail": time_method},
            {"step": 3, "action": "Horizontal sampling", "detail": f"{space_method}; grid footprint {grid_footprint_km} km"},
            {"step": 4, "action": "Depth alignment", "detail": "Model linearly interpolated to accepted observation depths"},
            {"step": 5, "action": "Uncertainty", "detail": "Paired bootstrap 95% confidence intervals when at least four levels match"},
        ],
    }
    return result
