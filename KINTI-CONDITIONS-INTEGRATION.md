# Kinti Conditions · Surf + Kitesurf + Windsurf

Botón flotante unificado para Kinti Máncora.

## Sustituir los widgets anteriores

Eliminar de la web las etiquetas/scripts de `kinti-surf-floating` y `kinti-wind-floating` si están presentes, y usar únicamente:

```html
<kinti-conditions-floating></kinti-conditions-floating>
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/denistwins/kinti-surf@20c2808af198889e68d36c8db831c759e4620d0a/kinti-conditions-floating.js">
</script>
```

El botón cerrado muestra un resumen de Surf + viento. Al abrirlo ofrece tres pestañas:

- SURF
- KITESURF
- WINDSURF

El componente usa el mismo feed LIVE `data/surf-data.json` de Copernicus Marine + NOAA GFS.

## Posición opcional

```html
<kinti-conditions-floating style="--kcf-bottom: 20px; --kcf-right: 20px;"></kinti-conditions-floating>
```

## Pestaña inicial opcional

```html
<kinti-conditions-floating tab="kite"></kinti-conditions-floating>
```

Valores disponibles: `surf`, `kite`, `windsurf`.
