"""Compare nearby Copernicus wave grid cells for Máncora.

The goal is not to choose a 'best surf' cell from one snapshot. It identifies
valid ocean grid cells, their distance to the break, and how their wave fields
differ so we can choose a stable offshore reference for Kinti Surf.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from math import radians, sin, cos, asin, sqrt
import os

import pandas as pd

from config import SPOT, COPERNICUS_WAVES


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0088
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def fail(message: str) -> None:
    print(f"❌ {message}")
    raise SystemExit(1)


def main() -> None:
    if not os.getenv("COPERNICUSMARINE_SERVICE_USERNAME") or not os.getenv("COPERNICUSMARINE_SERVICE_PASSWORD"):
        fail("Faltan los secretos de Copernicus Marine en GitHub Actions.")

    try:
        import copernicusmarine
    except ImportError:
        fail("No está instalado copernicusmarine.")

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(hours=6)
    end = now + timedelta(hours=6)

    # Small box around the break, extending offshore (west) and slightly N/S.
    west, east = -81.32, -81.055
    south, north = -4.22, -3.99

    print("🌊 Kinti Surf — calibración espacial Copernicus")
    print(f"Break Máncora: {SPOT['break_lat']:.3f}, {SPOT['break_lon']:.3f}")
    print(f"Caja consultada: lon {west} → {east} | lat {south} → {north}")
    print(f"Dataset: {COPERNICUS_WAVES}")

    try:
        df = copernicusmarine.read_dataframe(
            dataset_id=COPERNICUS_WAVES,
            variables=["VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"],
            minimum_longitude=west,
            maximum_longitude=east,
            minimum_latitude=south,
            maximum_latitude=north,
            start_datetime=start.isoformat(),
            end_datetime=end.isoformat(),
            disable_progress_bar=True,
        ).reset_index()
    except Exception as exc:
        fail(f"No se pudo leer la grilla: {type(exc).__name__}: {exc}")

    if df.empty:
        fail("Copernicus devolvió una grilla vacía.")

    needed = ["time", "latitude", "longitude", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        fail("Faltan columnas: " + ", ".join(missing))

    df["time"] = pd.to_datetime(df["time"], utc=True)
    numeric = ["VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"]
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Remove land / invalid cells and pick the time closest to 'now'.
    valid = df.dropna(subset=["VHM0", "VHM0_SW1"]).copy()
    if valid.empty:
        fail("No encontramos celdas oceánicas válidas en la caja.")

    valid["time_delta_s"] = (valid["time"] - pd.Timestamp(now)).abs().dt.total_seconds()
    nearest_time = valid.loc[valid["time_delta_s"].idxmin(), "time"]
    snap = valid[valid["time"] == nearest_time].copy()

    snap["distance_km"] = snap.apply(
        lambda r: haversine_km(SPOT["break_lat"], SPOT["break_lon"], float(r["latitude"]), float(r["longitude"])),
        axis=1,
    )
    snap["band"] = pd.cut(
        snap["distance_km"],
        bins=[-0.1, 4, 8, 15, 25, 1000],
        labels=["muy costera", "costera", "offshore ideal", "offshore", "lejana"],
    )
    snap = snap.sort_values(["distance_km", "longitude"]).reset_index(drop=True)

    # Keep a compact list; the preferred candidate is the nearest valid cell in
    # the 8–15 km band. If none exists, use the nearest 4–25 km cell.
    preferred_pool = snap[(snap["distance_km"] >= 8) & (snap["distance_km"] <= 15)]
    if preferred_pool.empty:
        preferred_pool = snap[(snap["distance_km"] >= 4) & (snap["distance_km"] <= 25)]
    if preferred_pool.empty:
        preferred_pool = snap
    preferred = preferred_pool.iloc[0]

    cols = ["latitude", "longitude", "distance_km", "band", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"]
    shown = snap[cols].head(12).copy()
    shown["distance_km"] = shown["distance_km"].round(1)
    for col in ["VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"]:
        shown[col] = shown[col].round(2)

    print(f"\nInstantánea comparada: {nearest_time.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Celdas oceánicas válidas: {len(snap)}")
    print("\nCeldas más cercanas al break:")
    print(shown.to_string(index=False))

    print("\n🎯 CANDIDATA INICIAL RECOMENDADA")
    print(f"latitude={preferred['latitude']:.6f}")
    print(f"longitude={preferred['longitude']:.6f}")
    print(f"distance_km={preferred['distance_km']:.1f}")
    print(f"swell={preferred['VHM0_SW1']:.2f} m | period={preferred['VTM01_SW1']:.2f} s | dir={preferred['VMDR_SW1']:.1f}°")
    print(f"total_wave={preferred['VHM0']:.2f} m | peak_period={preferred['VTPK']:.2f} s")
    print("\nNota: esta selección es geométrica/operativa. La validaremos con varias corridas y observación local antes de fijarla definitivamente.")


if __name__ == "__main__":
    main()
