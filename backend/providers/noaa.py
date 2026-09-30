"""NOAA GFS 0.25° provider using NOMADS Grib Filter."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from pathlib import Path
import tempfile
import requests
import cfgrib
import numpy as np

from config import SPOT

BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
CYCLES = (18, 12, 6, 0)


def _latest_cycle(now=None):
    now = now or datetime.now(timezone.utc)
    for day_offset in (0, 1):
        day = now - timedelta(days=day_offset)
        for cycle in CYCLES:
            run = day.replace(hour=cycle, minute=0, second=0, microsecond=0)
            if run <= now:
                return run
    raise RuntimeError("No GFS cycle candidate")


def _download(run: datetime, fhour: int, target: Path):
    lat, lon = SPOT["break_lat"], SPOT["break_lon"]
    params = {
        "file": f"gfs.t{run:%H}z.pgrb2.0p25.f{fhour:03d}",
        "var_UGRD": "on", "var_VGRD": "on", "var_GUST": "on",
        "lev_10_m_above_ground": "on", "lev_surface": "on",
        "subregion": "",
        "leftlon": lon - .15, "rightlon": lon + .15,
        "toplat": lat + .15, "bottomlat": lat - .15,
        "dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos",
    }
    r = requests.get(BASE, params=params, timeout=45)
    r.raise_for_status()
    target.write_bytes(r.content)


def _nearest_value(ds, candidates, lat, lon):
    for name in candidates:
        if name in ds.data_vars:
            da = ds[name]
            try:
                return float(da.sel(latitude=lat, longitude=(lon % 360), method="nearest").values)
            except Exception:
                return float(np.asarray(da.values).reshape(-1)[0])
    return None


def fetch_wind(hours: int = 30):
    run = _latest_cycle()
    out = []
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        for fh in range(0, hours + 1):
            path = td / f"gfs_{fh:03d}.grib2"
            try:
                _download(run, fh, path)
                datasets = cfgrib.open_datasets(str(path))
                u = v = gust = None
                for ds in datasets:
                    u = u if u is not None else _nearest_value(ds, ["u10", "u"], SPOT["break_lat"], SPOT["break_lon"])
                    v = v if v is not None else _nearest_value(ds, ["v10", "v"], SPOT["break_lat"], SPOT["break_lon"])
                    gust = gust if gust is not None else _nearest_value(ds, ["gust"], SPOT["break_lat"], SPOT["break_lon"])
                if u is None or v is None:
                    continue
                speed_ms = (u*u + v*v) ** .5
                direction = (270 - np.degrees(np.arctan2(v, u))) % 360
                out.append({
                    "time": run + timedelta(hours=fh),
                    "wind_speed_kmh": speed_ms * 3.6,
                    "wind_direction_deg": float(direction),
                    "gust_kmh": (gust * 3.6) if gust is not None else None,
                    "model_run": run,
                })
            except Exception:
                continue
    if not out:
        raise RuntimeError("NOAA GFS: no forecast records returned")
    return out
