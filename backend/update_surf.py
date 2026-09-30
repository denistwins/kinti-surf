"""Builds data/surf-data.json from Copernicus Marine + NOAA GFS."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from pathlib import Path
import json, sys
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from config import SPOT
from providers.copernicus import fetch_waves, fetch_sea_level, fetch_currents
from providers.noaa import fetch_wind


def circular_interp(a, b, t):
    if pd.isna(a): return b
    if pd.isna(b): return a
    delta = ((b - a + 180) % 360) - 180
    return (a + delta * t) % 360


def hourly_wave_frame(df, start, end):
    df = df.copy()
    df["time"] = pd.to_datetime(df["time"], utc=True)
    df = df.drop_duplicates("time").set_index("time").sort_index()
    idx = pd.date_range(start=start, end=end, freq="1h", tz="UTC")
    numeric = [c for c in df.columns if c not in {"latitude","longitude","swell_direction_deg","swell2_direction_deg"}]
    out = df.reindex(df.index.union(idx)).sort_index()
    out[numeric] = out[numeric].interpolate(method="time")
    for col in [c for c in ["swell_direction_deg","swell2_direction_deg"] if c in out.columns]:
        known = out[col].dropna()
        vals = []
        for ts in out.index:
            if ts in known.index:
                vals.append(float(known.loc[ts])); continue
            before = known[known.index < ts]
            after = known[known.index > ts]
            if before.empty or after.empty:
                vals.append(float(before.iloc[-1] if not before.empty else after.iloc[0])); continue
            t0, t1 = before.index[-1], after.index[0]
            frac = (ts - t0) / (t1 - t0)
            vals.append(circular_interp(float(before.iloc[-1]), float(after.iloc[0]), frac))
        out[col] = vals
    return out.loc[idx]


def normalize_tide(series):
    lo, hi = series.min(), series.max()
    if pd.isna(lo) or pd.isna(hi) or hi - lo < 1e-6:
        return pd.Series(.5, index=series.index)
    return (series - lo) / (hi - lo)


def build():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    end = now + timedelta(hours=30)
    waves = hourly_wave_frame(fetch_waves(now - timedelta(hours=3), end + timedelta(hours=3)), now, end)

    sea = fetch_sea_level(now, end)
    sea["time"] = pd.to_datetime(sea["time"], utc=True)
    sea = sea.drop_duplicates("time").set_index("time").sort_index().reindex(waves.index).interpolate(method="time")
    sea["tide_level_norm"] = normalize_tide(sea["sea_level_m"])
    sea["tide_trend"] = sea["sea_level_m"].diff().fillna(0).map(lambda x: "rising" if x > .005 else "falling" if x < -.005 else "steady")

    cur = fetch_currents(now, end)
    cur["time"] = pd.to_datetime(cur["time"], utc=True)
    cur = cur.drop_duplicates("time").set_index("time").sort_index().reindex(waves.index).interpolate(method="time")

    wind = pd.DataFrame(fetch_wind(30))
    wind["time"] = pd.to_datetime(wind["time"], utc=True)
    wind = wind.drop_duplicates("time").set_index("time").sort_index().reindex(waves.index).interpolate(method="time")

    model_run = pd.to_datetime(wind["model_run"].dropna().iloc[0], utc=True).to_pydatetime() if "model_run" in wind and wind["model_run"].notna().any() else now
    records = []
    for ts in waves.index:
        w, s, c, g = waves.loc[ts], sea.loc[ts], cur.loc[ts], wind.loc[ts]
        records.append({
            "timestamp": ts.isoformat().replace('+00:00','Z'),
            "swellHeightM": round(float(w.get("swell_height_m", w.get("wave_height_m", float('nan')))), 3),
            "swellPeriodS": round(float(w.get("swell_period_s", w.get("wave_peak_period_s", float('nan')))), 2),
            "swellDirectionDeg": round(float(w.get("swell_direction_deg", float('nan'))), 1),
            "windSpeedKmh": round(float(g["wind_speed_kmh"]), 1),
            "windDirectionDeg": round(float(g["wind_direction_deg"]), 1),
            "gustKmh": None if pd.isna(g.get("gust_kmh")) else round(float(g["gust_kmh"]), 1),
            "tideLevelNorm": round(float(s["tide_level_norm"]), 3),
            "tideTrend": s["tide_trend"],
            "currentSpeedMs": round(float(c["current_speed_ms"]), 3),
            "currentDirectionDeg": round(float(c["current_direction_deg"]), 1),
            "waveDataAgeHours": 0,
            "weatherDataAgeHours": max(0, round((now - model_run).total_seconds() / 3600, 1))
        })

    payload = {
        "schemaVersion": 1,
        "generatedAt": now.isoformat().replace('+00:00','Z'),
        "spot": {"name": SPOT["name"], "breakLat": SPOT["break_lat"], "breakLon": SPOT["break_lon"], "oceanReferenceLat": SPOT["ocean_lat"], "oceanReferenceLon": SPOT["ocean_lon"]},
        "source": {"mode": "live", "wave": "Copernicus Marine", "weather": "NOAA GFS / NOMADS"},
        "hours": records
    }
    out = ROOT / "data" / "surf-data.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out} with {len(records)} hourly records")


if __name__ == '__main__':
    build()
