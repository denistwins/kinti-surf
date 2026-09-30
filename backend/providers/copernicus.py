"""Copernicus Marine provider for Kinti Surf."""
from __future__ import annotations
from datetime import datetime
import math
import pandas as pd
import copernicusmarine

from config import SPOT, COPERNICUS_WAVES, COPERNICUS_SEA_LEVEL, COPERNICUS_SURFACE_CURRENT


def _read(dataset_id: str, variables: list[str], start: datetime, end: datetime) -> pd.DataFrame:
    lat, lon = SPOT["ocean_lat"], SPOT["ocean_lon"]
    return copernicusmarine.read_dataframe(
        dataset_id=dataset_id,
        variables=variables,
        minimum_longitude=lon,
        maximum_longitude=lon,
        minimum_latitude=lat,
        maximum_latitude=lat,
        start_datetime=start.isoformat(),
        end_datetime=end.isoformat(),
        coordinates_selection_method="nearest",
        disable_progress_bar=True,
    ).reset_index()


def fetch_waves(start: datetime, end: datetime) -> pd.DataFrame:
    vars_ = ["VHM0", "VTPK", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0_SW2", "VTM01_SW2", "VMDR_SW2"]
    df = _read(COPERNICUS_WAVES, vars_, start, end)
    return df.rename(columns={
        "VHM0": "wave_height_m",
        "VTPK": "wave_peak_period_s",
        "VHM0_SW1": "swell_height_m",
        "VTM01_SW1": "swell_period_s",
        "VMDR_SW1": "swell_direction_deg",
        "VHM0_SW2": "swell2_height_m",
        "VTM01_SW2": "swell2_period_s",
        "VMDR_SW2": "swell2_direction_deg",
    })


def fetch_sea_level(start: datetime, end: datetime) -> pd.DataFrame:
    df = _read(COPERNICUS_SEA_LEVEL, ["zos"], start, end)
    return df.rename(columns={"zos": "sea_level_m"})


def fetch_currents(start: datetime, end: datetime) -> pd.DataFrame:
    try:
        df = _read(COPERNICUS_SURFACE_CURRENT, ["utotal", "vtotal"], start, end)
        u, v = "utotal", "vtotal"
    except Exception:
        df = _read(COPERNICUS_SURFACE_CURRENT, ["uo", "vo"], start, end)
        u, v = "uo", "vo"
    df["current_speed_ms"] = (df[u] ** 2 + df[v] ** 2) ** 0.5
    df["current_direction_deg"] = (df.apply(lambda r: math.degrees(math.atan2(r[u], r[v])), axis=1) + 360) % 360
    return df[["time", "current_speed_ms", "current_direction_deg"]]
