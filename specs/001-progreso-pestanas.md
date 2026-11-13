# 001 · Progreso con pestañas internas
Estado: hecha
Depende de: —

## Objetivo
Preparar el módulo **Progreso** para alojar varias secciones (Ejercicios hoy; Medidas en 002; Músculos en 003) sin crecer en una sola pantalla. Es un refactor: no cambia lo que ve el usuario mientras haya una sola sección.

## Fuera de alcance
- Contenido de Medidas y Músculos.
- Cambios en la gráfica, métricas o récords actuales.

## Diseño
- Estado de módulo `progTab` (`'ejercicios'` por defecto), junto a `progEx` y `progMetric`. No se persiste en `S`.
- Lista `PROG_TABS = [{ id, label, render }]`. `renderProgress()` pinta el título, la barra de pestañas (clase `seg`, ya existente) y delega en `render` de la pestaña activa.
- El cuerpo actual de `renderProgress` pasa a `renderProgEjercicios()`, sin cambios de lógica.
- La barra de pestañas **se oculta mientras `PROG_TABS.length < 2`**.
- Nueva acción `ACT.progTab` (`data-a="progTab" data-v="<id>"`) que cambia `progTab` y llama a `render()`.
- Cada pestaña decide su propio estado vacío. El `return` temprano de "sin sesiones" se queda **dentro** de la pestaña Ejercicios, para que otras pestañas no dependan de que existan sesiones.

## Criterios de aceptación
- **CA-1** Dado el estado actual (solo Ejercicios), cuando abro Progreso con sesiones, entonces veo exactamente el mismo contenido que antes y **no** aparece barra de pestañas.
- **CA-2** Dado que no hay sesiones, cuando abro Progreso, entonces veo el mensaje vacío de Ejercicios.
- **CA-3** Dado `PROG_TABS` con dos pestañas, cuando abro Progreso, entonces veo la barra con ambas y la activa marcada `on`.
- **CA-4** Cuando pulso otra pestaña, entonces cambia el contenido, y al salir y volver a Progreso en la misma sesión de la app se conserva la elegida.
- **CA-5** Cambiar de pestaña no altera `progEx` ni `progMetric`.
- **CA-6** `S` no cambia (sin migración, sin nuevas claves).

## Tareas
- [x] Test de caracterización: capturar el HTML actual de Progreso con una sesión de ejemplo (red de seguridad del refactor).
- [x] Extraer `renderProgEjercicios()` y `PROG_TABS`.
- [x] `ACT.progTab` + estilos si hacen falta.
- [x] Tests CA-1…CA-6 (para CA-3/4 se registra una pestaña de prueba vía `app.eval`).
- [x] Subir `CACHE` y `APP_VERSION`.

## Riesgos y decisiones abiertas
- Ninguna relevante; es el cambio más pequeño del plan y sirve para estrenar el flujo.
