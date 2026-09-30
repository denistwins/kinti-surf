"""Safe smoke test for the Kinti Surf -> Copernicus Marine connection.

Reads a very small forecast subset near Máncora. Credentials are expected only
through Copernicus Marine's supported environment variables and are never
printed by this script.
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
import os

import pandas as pd

from config import SPOT, COPERNICUS_WAVES


def fail(message: str, code: int = 1) -> None:
    print(f"❌ {message}")
    raise SystemExit(code)


def main() -> None:
    username = os.getenv("COPERNICUSMARINE_SERVICE_USERNAME")
    password = os.getenv("COPERNICUSMARINE_SERVICE_PASSWORD")
    if not username or not password:
        fail(
            "Faltan los secretos COPERNICUSMARINE_SERVICE_USERNAME y/o "
            "COPERNICUSMARINE_SERVICE_PASSWORD."
        )

    try:
        import copernicusmarine
    except ImportError:
        fail("No está instalado 'copernicusmarine'. Ejecuta: pip install -r backend/requirements.txt")

    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = now - timedelta(hours=3)
    end = now + timedelta(hours=9)
    lat = SPOT["ocean_lat"]
    lon = SPOT["ocean_lon"]

    print("🌊 Kinti Surf — prueba de Copernicus Marine")
    print(f"Spot: {SPOT['name']}")
    print(f"Referencia oceánica solicitada: {lat:.3f}, {lon:.3f}")
    print(f"Dataset: {COPERNICUS_WAVES}")
    print(f"Ventana UTC: {start.isoformat()} → {end.isoformat()}")
    print("Autenticando y leyendo un subset mínimo…")

    try:
        df = copernicusmarine.read_dataframe(
            dataset_id=COPERNICUS_WAVES,
            variables=["VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"],
            minimum_longitude=lon,
            maximum_longitude=lon,
            minimum_latitude=lat,
            maximum_latitude=lat,
            start_datetime=start.isoformat(),
            end_datetime=end.isoformat(),
            coordinates_selection_method="nearest",
            disable_progress_bar=True,
        ).reset_index()
    except Exception as exc:
        fail(f"Copernicus rechazó o no pudo completar la consulta: {type(exc).__name__}: {exc}")

    if df.empty:
        fail("La autenticación funcionó, pero el subset regresó vacío. Habrá que calibrar la celda oceánica.")

    required = ["time", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        fail(f"Conexión lograda, pero faltan variables esperadas: {', '.join(missing)}")

    cols = [c for c in ["time", "latitude", "longitude", "VHM0_SW1", "VTM01_SW1", "VMDR_SW1", "VHM0", "VTPK"] if c in df.columns]
    sample = df[cols].copy().tail(4)
    if "time" in sample.columns:
        sample["time"] = pd.to_datetime(sample["time"], utc=True).dt.strftime("%Y-%m-%d %H:%M UTC")

    print("\n✅ CONEXIÓN COPERNICUS OK")
    print(f"Registros recibidos: {len(df)}")
    print("Últimos valores devueltos:")
    print(sample.to_string(index=False))
    print("\nSiguiente paso: calibrar la mejor celda frente a Máncora y activar update_surf.py.")


if __name__ == "__main__":
    main()
