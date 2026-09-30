# Kinti Surf V1

Prototipo independiente para responder una pregunta simple: **¿cuándo conviene surfear hoy en Máncora?**

## Qué contiene

- `surf-engine.js`: Kinti Surf Score 0–100 y detector de ventanas continuas.
- `kinti-surf-widget.js`: Web Component reutilizable `<kinti-surf-widget>`.
- `styles.css`: interfaz responsive, sin frameworks ni fuentes externas.
- `data/surf-data.json`: contrato de datos que consumirá la web.
- `backend/`: adaptadores para Copernicus Marine + NOAA GFS/NOMADS.
- `.github/workflows/update-surf.yml`: solicitud/reconstrucción horaria gratuita con GitHub Actions.

## Abrir el prototipo

Desde esta carpeta:

```bash
python -m http.server 8080
```

Abrir `http://localhost:8080`.

El JSON incluido es **demostrativo**, no son condiciones reales del día. Sirve para probar diseño, score y detección de ventanas antes de conectar credenciales.

## Activar Copernicus Marine

1. Crear una cuenta gratuita en Copernicus Marine.
2. En GitHub, crear dos repository secrets:
   - `COPERNICUSMARINE_SERVICE_USERNAME`
   - `COPERNICUSMARINE_SERVICE_PASSWORD`
3. Ejecutar manualmente `Update Kinti Surf` una vez.
4. Luego el workflow queda programado a los 7 minutos de cada hora.

## Fuente de viento

NOAA GFS 0.25° vía NOMADS Grib Filter, sin API key.

## Punto inicial

- Break: `-4.106, -81.060`
- Referencia oceánica inicial: `-4.106, -81.143` (~9 km al oeste)

El punto oceánico es deliberadamente configurable; debe calibrarse contra las celdas válidas de Copernicus y observación local.

## Kinti Surf Score V1

- Swell: 40 puntos
- Viento: 30 puntos
- Marea + corriente: 20 puntos
- Estabilidad: 10 puntos

El score es un **modelo heurístico inicial**, no un índice científico validado. Debe calibrarse con observaciones de surfistas locales.

## Ventanas

- Ventana normal: al menos 2 horas consecutivas con score ≥ 70.
- Si no existe, se busca el mejor bloque de 2 horas con promedio ≥ 55 y se marca como “mejor momento disponible”.
- Por defecto solo se recomiendan horas de luz aproximadas en Máncora.

## Importante

El widget no evalúa seguridad local, rip currents costeras ni condiciones exactas del break. Las corrientes de un modelo oceánico global no sustituyen observación en playa.

## Prueba segura de conexión a Copernicus

Se incluye `backend/test_copernicus.py` y el workflow manual **Test Copernicus Connection**.

1. En el repositorio de GitHub: **Settings → Secrets and variables → Actions**.
2. Crear `COPERNICUSMARINE_SERVICE_USERNAME` con el usuario/email de Copernicus.
3. Crear `COPERNICUSMARINE_SERVICE_PASSWORD` con la contraseña de Copernicus.
4. Ir a **Actions → Test Copernicus Connection → Run workflow**.
5. El resultado correcto muestra `✅ CONEXIÓN COPERNICUS OK` y unas pocas filas de swell frente a Máncora.

La contraseña nunca se escribe en los archivos del proyecto ni se imprime en los logs.
