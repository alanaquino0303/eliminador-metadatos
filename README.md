# Eliminador de Metadatos

**Eliminador de Metadatos** es una aplicación web ligera para eliminar metadatos de archivos antes de compartirlos.  
Soporta imágenes (JPG/PNG/WEBP/GIF), limpieza básica de PDF y limpieza experimental de audio y video mediante **ffmpeg.wasm**. Pensada para **privacidad**, **facilidad de uso** y **accesibilidad**.

---

## Características principales

- Interfaz accesible y responsiva con modo oscuro.  
- Limpieza EXIF para JPEG (usa `piexifjs`) y fallback por canvas para otros formatos.  
- Limpieza de campos comunes de PDF con `pdf-lib`.  
- Soporte experimental para audio/video usando `@ffmpeg/ffmpeg` (ffmpeg.wasm).  
- Barra de progreso, vista previa y métricas de tamaño antes/después.  

---

## Estructura del repositorio

```
/ (root)
├─ index.html        # Interfaz principal (carga librerías externas).
├─ script.js         # Lógica de upload y limpieza.
├─ style.css         # Estilos y modo oscuro.
├─ README.md         # Documentación.
```

---

## Requisitos / Notas técnicas

- Funciona en navegadores modernos que soporten `FileReader`, `canvas` y `Blob`.  
- Para limpieza multimedia `ffmpeg.wasm` se carga desde CDN; la operación es intensiva en CPU/RAM.  
- Librerías cargadas en `index.html`: `piexifjs`, `pdf-lib`, `@ffmpeg/ffmpeg`.

---

## Visita la página web

[Presiona aquí.](https://tusitio.com)

---

## Autor

Alan Aquino.
