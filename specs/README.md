# Specs (Spec-Driven Development)

Cada cambio grande empieza como una spec en esta carpeta. La spec es la fuente de verdad: si el código y la spec divergen, se actualiza primero la spec.

## Flujo

1. **Escribir/ajustar la spec** (`NNN-nombre.md`) y acordarla antes de programar.
2. **Tests primero**: cada criterio de aceptación (CA) se convierte en un test de `node:test` en `tests/`. El ID del CA va en el nombre del test (`CA-3: …`).
3. **Implementar** hasta que los tests pasen (`npm test`).
4. **Cerrar**: marcar las tareas, poner `Estado: hecho` y, si se tocaron archivos publicados, subir `CACHE` en `sw.js` y `APP_VERSION` en `index.html`.

## Plantilla

```md
# NNN · Título
Estado: borrador | hecha (v5) | en curso | hecha
Depende de: NNN

## Objetivo
## Fuera de alcance
## Diseño
## Criterios de aceptación   (Dado / Cuando / Entonces)
## Tareas
## Riesgos y decisiones abiertas
```

## Índice

| Spec | Qué | Estado |
|---|---|---|
| [001](001-progreso-pestanas.md) | Progreso con pestañas internas (refactor sin funciones nuevas) | hecha (v4) |
| [002](002-medidas.md) | Registro de medidas corporales con cinta | hecha (v5) |
| [003](003-mapa-calor.md) | Mapa de calor muscular (hombre/mujer) + catálogo de ejercicios | hecha (v8) |
| [004](004-android-capacitor.md) | APK Android con Capacitor + notificaciones programadas | hecha (v12); pendiente la copia de la clave |

Orden acordado: 001 → 002 → 003 → 004. 
