SPOT = {
    "name": "Máncora",
    "break_lat": -4.106,
    "break_lon": -81.060,
    # Provisional Copernicus ocean grid cell selected after spatial calibration:
    # ~12 km offshore and close to the break latitude. We will keep validating it
    # across multiple model runs and local observations before declaring it final.
    "ocean_lat": -4.083333,
    "ocean_lon": -81.166667,
    "timezone": "America/Lima",
}

COPERNICUS_WAVES = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
COPERNICUS_SEA_LEVEL = "cmems_mod_glo_phy_anfc_merged-sl_PT1H-i"
COPERNICUS_SURFACE_CURRENT = "cmems_mod_glo_phy_anfc_merged-uv_PT1H-i"
