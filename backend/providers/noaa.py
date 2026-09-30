"""NOAA GFS 0.25° provider using NOMADS Grib Filter.

NOMADS' GFS grid uses 0..360 longitudes. This adapter converts Máncora's
negative-west longitude accordingly and falls back across recent model cycles
when the newest nominal cycle has not been published yet.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path
import tempfile
import time

import cfgrib
import numpy as np
import requests

from config import SPOT

BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
CYCLES = (18, 12, 6, 0)


def _candidate_runs(now=None):
    now = now or datetime.now(timezone.utc)
    runs = []
    for day_offset in (0, 1, 2):
        day = now - timedelta(days=day_offset)
        for cycle in CYCLES:
            run = day.replace(hour=cycle, minute=0, second=0, microsecond=0)
            if run <= now:
                runs.append(run)
    return sorted(set(runs), reverse=True)


def _download(run: datetime, fhour: int, target: Path):
    lat = SPOT["break_lat"]
    lon360 = SPOT["break_lon"] % 360
    # A ~0.30° box safely encloses at least one point of the 0.25° GFS grid.
    params = {
        "file": f"gfs.t{run:%H}z.pgrb2.0p25.f{fhour:03d}",
        "var_UGRD": "on",
        "var_VGRD": "on",
        "var_GUST": "on",
        "lev_10_m_above_ground": "on",
        "lev_surface": "on",
        "subregion": "",
        "leftlon": lon360 - 0.20,
        "rightlon": lon360 + 0.20,
        "toplat": lat + 0.20,
        "bottomlat": lat - 0.20,
        "dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos",
    }
    r = requests.get(BASE, params=params, timeout=45)
    r.raise_for_status()
    content = r.content
    # Missing/invalid NOMADS requests often return a small text/HTML response
    # with HTTP 200. A real GRIB2 payload starts with the GRIB magic bytes.
    if len(content) < 16 or not content.startswith(b"GRIB"):
        snippet = content[:180].decode("utf-8", errors="replace").replace("\n", " ")
        raise RuntimeError(f"NOMADS did not return GRIB2 ({snippet})")
    target.write_bytes(content)


def _nearest_value(ds, candidates, lat, lon):
    lon360 = lon % 360
    for name in candidates:
        if name in ds.data_vars:
            da = ds[name]
            try:
                return float(da.sel(latitude=lat, longitude=lon360, method="nearest").values)
            except Exception:
                return float(np.asarray(da.values).reshape(-1)[0])
    return None


def _parse_grib(path: Path):
    datasets = cfgrib.open_datasets(str(path))
    u = v = gust = None
    for ds in datasets:
        u = u if u is not None else _nearest_value(ds, ["u10", "u"], SPOT["break_lat"], SPOT["break_lon"])
        v = v if v is not None else _nearest_value(ds, ["v10", "v"], SPOT["break_lat"], SPOT["break_lon"])
        gust = gust if gust is not None else _nearest_value(ds, ["gust"], SPOT["break_lat"], SPOT["break_lon"])
    if u is None or v is None:
        raise RuntimeError("GRIB2 returned without 10 m U/V wind components")
    return u, v, gust


def _resolve_run(now: datetime, td: Path):
    errors = []
    for run in _candidate_runs(now):
        # Ask for the forecast hour closest to 'now', not necessarily f000.
        fh = max(0, int((now - run).total_seconds() // 3600))
        probe = td / f"probe_{run:%Y%m%d%H}_{fh:03d}.grib2"
        try:
            _download(run, fh, probe)
            _parse_grib(probe)
            return run, fh, probe
        except Exception as exc:
            errors.append(f"{run:%Y-%m-%d %HZ}/f{fh:03d}: {exc}")
            # Be polite to NOMADS when probing a cycle that is not published yet.
            time.sleep(1)
    detail = " | ".join(errors[:5])
    raise RuntimeError(f"NOAA GFS: no recent published cycle usable. {detail}")


def fetch_wind(hours: int = 30):
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    out = []
    with tempfile.TemporaryDirectory() as tmp:
        td = Path(tmp)
        run, start_fh, probe = _resolve_run(now, td)

        for offset in range(0, hours + 1):
            fh = start_fh + offset
            valid_time = run + timedelta(hours=fh)
            path = td / f"gfs_{fh:03d}.grib2"
            try:
                if offset == 0:
                    path = probe
                else:
                    _download(run, fh, path)
                u, v, gust = _parse_grib(path)
                speed_ms = (u * u + v * v) ** 0.5
                # Meteorological direction: where the wind comes FROM.
                direction = (270 - np.degrees(np.arctan2(v, u))) % 360
                out.append(
                    {
                        "time": valid_time,
                        "wind_speed_kmh": float(speed_ms * 3.6),
                        "wind_direction_deg": float(direction),
                        "gust_kmh": float(gust * 3.6) if gust is not None else None,
                        "model_run": run,
                    }
                )
            except Exception as exc:
                print(f"NOAA warning f{fh:03d}: {type(exc).__name__}: {exc}")
                continue

    if not out:
        raise RuntimeError("NOAA GFS: no forecast records returned after selecting a valid cycle")
    return out
