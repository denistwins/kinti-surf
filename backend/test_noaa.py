"""Smoke test for NOAA GFS wind data near Máncora."""
from __future__ import annotations

from providers.noaa import fetch_wind


def main() -> None:
    print("💨 Kinti Surf — prueba NOAA GFS")
    print("Consultando viento de 10 m y ráfagas cerca de Máncora…")
    rows = fetch_wind(hours=3)
    print("\n✅ CONEXIÓN NOAA GFS OK")
    print(f"Registros recibidos: {len(rows)}")
    for row in rows[:4]:
        gust = row.get("gust_kmh")
        gust_text = f"{gust:.1f} km/h" if gust is not None else "n/d"
        print(
            f"{row['time'].strftime('%Y-%m-%d %H:%M UTC')} | "
            f"viento={row['wind_speed_kmh']:.1f} km/h | "
            f"dir={row['wind_direction_deg']:.0f}° | ráfaga={gust_text} | "
            f"modelo={row['model_run'].strftime('%Y-%m-%d %HZ')}"
        )


if __name__ == "__main__":
    main()
