# Kinti Surf · integración en la web Kinti

Versión inicial: botón flotante aislado con Shadow DOM. No modifica el layout, Lenis, navegación ni estilos globales de Kinti.

## Insertar antes de `</body>`

```html
<kinti-surf-floating></kinti-surf-floating>
<script
  type="module"
  src="https://cdn.jsdelivr.net/gh/denistwins/kinti-surf@c5a4e5165ce77da1474ad4489182bbf4a09a6620/kinti-surf-floating.js">
</script>
```

El componente consume los datos en vivo desde:

`https://raw.githubusercontent.com/denistwins/kinti-surf/main/data/surf-data.json`

El archivo de datos se actualiza automáticamente cada 3 horas y el componente vuelve a consultarlo/recalcularlo cada hora.

## Posición

Por defecto:

- desktop: 22 px desde la derecha y 22 px desde abajo
- mobile: 14 px desde la derecha y 14 px desde abajo

Se puede desplazar sin editar el componente:

```html
<kinti-surf-floating style="--ksf-bottom: 84px; --ksf-right: 20px;"></kinti-surf-floating>
```

Esto es útil si posteriormente convive con WhatsApp u otro botón flotante.
