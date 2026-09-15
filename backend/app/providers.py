"""Provider-neutral dataset identity and capability metadata.

The first provider wraps the existing xarray dataset.  Keeping this contract
small lets a future Zarr, Kerchunk, HYCOM, or Copernicus provider be registered
without teaching the React application about storage details.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Callable, Protocol

import xarray as xr


@dataclass(frozen=True)
class SourceDescriptor:
    id: str
    label: str
    organisation: str
    source_type: str
    url: str
    processing_level: str
    operational: bool


@dataclass(frozen=True)
class DatasetBundle:
    id: str
    title: str
    provider: str
    source: SourceDescriptor
    spatial_resolution: str
    temporal_resolution: str
    qc_mode: str
    derived: bool = False

    def model_dump(self) -> dict:
        return asdict(self)


class OceanDataProvider(Protocol):
    """Storage-independent contract used by the API query layer."""

    def catalog(self) -> list[DatasetBundle]: ...
    def capabilities(self) -> dict: ...
    def dataset(self) -> xr.Dataset: ...


class XarrayOceanProvider:
    id = "incois-xarray"

    def __init__(self, dataset_getter: Callable[[], xr.Dataset]):
        self._dataset_getter = dataset_getter

    def dataset(self) -> xr.Dataset:
        return self._dataset_getter()

    def catalog(self) -> list[DatasetBundle]:
        ds = self.dataset()
        source_url = ds.attrs.get(
            "source_url",
            "https://erddap.incois.gov.in/erddap/griddap/incois_argo_mnt_VAM.html",
        )
        return [DatasetBundle(
            id="incois_argo_mnt_VAM",
            title="INCOIS gridded Argo monthly analysis",
            provider=self.id,
            source=SourceDescriptor(
                id="incois-erddap",
                label="INCOIS ERDDAP · gridded Argo VAM",
                organisation="Indian National Centre for Ocean Information Services",
                source_type="analysis",
                url=source_url,
                processing_level="gridded analysis",
                operational=False,
            ),
            spatial_resolution=f"{ds.sizes['lat']} × {ds.sizes['lon']} native grid",
            temporal_resolution="monthly",
            qc_mode="source QC plus Argo profile flags 1 and 2",
        )]

    def capabilities(self) -> dict:
        ds = self.dataset()
        return {
            "provider": self.id,
            "variables": list(ds.data_vars),
            "depth_resolved": [name for name in ds.data_vars if "depth" in ds[name].dims],
            "supports": {
                "slice": True,
                "roi_volume": True,
                "binary_volume": True,
                "profile": True,
                "transect": True,
                "observations": True,
                "teos10": "temperature" in ds and "salinity" in ds,
                "forecast": False,
            },
        }
