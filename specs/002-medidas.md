# 002 · Medidas corporales
Estado: hecha
Depende de: 001

## Objetivo
Permitir registrar medidas con cinta (y el peso corporal) a lo largo del tiempo, verlas en lista con su variación y en gráfica, dentro de **Progreso → Medidas**.

## Fuera de alcance
- Relacionar las medidas con el mapa de calor (003).
- Fotos de progreso, cálculo de % graso, objetivos/metas.
- Conversión a pulgadas (solo cm y kg).

## Diseño

### Datos
`S.measures` = lista de `{ id, date, values, note }`, ordenada por `date` ascendente.
- `date`: timestamp del día (mediodía local, para evitar saltos por zona horaria).
- `values`: objeto con solo las claves rellenadas. Todas opcionales; mínimo una por medición.
- `note`: texto opcional.
- `migrate()` inicializa `S.measures = []` y descarta entradas malformadas (sin `date` numérica o con `values` vacío). Vale también para backups importados.

### Medidas (clave → etiqueta, unidad)
| Grupo | Claves |
|---|---|
| Peso | `peso` Peso corporal (kg) |
| Tronco | `cuello`, `hombros`, `pecho`, `cintura`, `cadera` (cm) |
| Brazos | `bicepsI`, `bicepsD`, `antebrazoI`, `antebrazoD` (cm) |
| Piernas | `musloI`, `musloD`, `pantorrillaI`, `pantorrillaD` (cm) |

Lado izquierdo y derecho siempre separados. La lista vive en una constante `MEASURES` (clave, etiqueta, unidad, grupo), de modo que añadir una medida es una línea.

### Vista (pestaña "Medidas" en `PROG_TABS`)
- Botón **Nueva medición** → `sheet()` con campos agrupados, fecha (por defecto hoy) y nota. Los campos empiezan **vacíos**: el último valor registrado se muestra como sugerencia (placeholder), para que solo se guarde lo que realmente se midió.
- Entrada numérica con coma o punto, validada de forma estricta (solo dígitos con un decimal opcional). Botones −/+ de ±0,5 **propios del formulario** (el `data-step` existente está ligado a la sesión activa y no es reutilizable): sobre un campo vacío parten de la sugerencia, o de un valor típico por medida si no hay historial.
- Selector de medida (`<select data-ch="measure">`, solo medidas con al menos un dato) + gráfica con `chartSVG` (se reutiliza tal cual) + tiles Última / Variación vs. anterior / Variación desde la primera.
- Lista **Registros**: más reciente arriba, con la variación respecto a la medición anterior **de esa misma medida**; pulsar una fila abre el sheet en modo edición, con botón Eliminar (con `ask()`).
- Formato `es-ES` (`fmtN`): `78,5 cm`. Variaciones con signo: `−1,5 cm`.
- Estado vacío si no hay mediciones.

### Guía visual "cómo medir"
Cada medida tiene una pequeña guía para medir siempre igual (sin eso, las variaciones de 0,5 cm no significan nada).
- En el sheet de alta/edición, cada campo lleva un botón **ⓘ** junto a la etiqueta. Al pulsarlo se despliega **en línea, debajo del campo** (no abre otro sheet, para no perder lo ya escrito) un panel con la imagen y 2-3 líneas de instrucciones. Pulsarlo de nuevo, o abrir otra guía, lo pliega.
- La guía se comparte entre lado izquierdo y derecho (`bicepsI` y `bicepsD` usan la misma imagen). El texto indica medir ambos lados con la misma postura.
- `MEASURES` gana dos campos por medida: `img` (ruta, opcional) y `guia` (texto en español). El **texto siempre se muestra**; la imagen es un complemento. Si falta o no carga, el panel sigue siendo útil.
- Imágenes: `assets/medidas/<clave>.webp`, cuadradas, 512×512, ~15-30 KB cada una. 9 imágenes: `cuello`, `hombros`, `pecho`, `cintura`, `cadera`, `biceps`, `antebrazo`, `muslo`, `pantorrilla`. El peso corporal solo lleva texto.
- Son assets estáticos: se añaden a `ASSETS` en `sw.js` para que funcionen offline, y más adelante entran en el `www/` de Capacitor sin cambios.
- Cada imagen lleva `alt` descriptivo en español. No se usa texto dentro de las imágenes (lo pone la app).
- Además, un bloque **"Consejos generales"** (misma hora del día, mejor por la mañana; sin ropa gruesa; cinta paralela al suelo, ajustada sin apretar; medir dos veces) accesible desde el encabezado del sheet.

Texto de cada guía (primera versión, ajustable):
| Medida | Cómo medir |
|---|---|
| Peso corporal | Por la mañana, tras ir al baño y antes de comer, con la misma báscula y poca ropa. |
| Cuello | Cinta justo por debajo de la nuez, horizontal. Cabeza recta, mirada al frente, sin tensar el cuello. |
| Hombros | Rodea la parte más ancha de los hombros (deltoides), pasando por el pecho y la espalda. Brazos relajados a los lados. |
| Pecho | A la altura de los pezones, por debajo de las axilas y por la espalda en horizontal. Respira normal y mide al soltar el aire. |
| Cintura | A la altura del ombligo (o en el punto más estrecho: elige uno y mantenlo siempre). Relajado, sin meter barriga, al soltar el aire. |
| Cadera | Alrededor de la parte más ancha de la cadera, con los pies juntos y la cinta paralela al suelo. |
| Bíceps (I/D) | A mitad entre el hombro y el codo, con el brazo relajado a un lado. Mide siempre con el brazo relajado, o siempre flexionado. |
| Antebrazo (I/D) | En la parte más gruesa, cerca del codo, con el brazo relajado y la palma hacia el muslo. |
| Muslo (I/D) | A mitad entre la cadera y la rodilla, de pie y con el peso repartido entre ambas piernas. |
| Pantorrilla (I/D) | En la parte más gruesa del gemelo, de pie y con el peso repartido. |

### Datos adicionales
- Las mediciones viajan en el export/import JSON por estar en `S`.
- `save()` inmediato al guardar/editar/borrar.

## Criterios de aceptación
- **CA-1** Dado un estado antiguo sin `measures`, cuando carga la app, entonces `S.measures` es `[]` y el resto de `S` no cambia.
- **CA-2** Dado un backup importado con `measures` malformadas (sin fecha, valores vacíos, tipo incorrecto), cuando se importa, entonces se descartan solo las inválidas.
- **CA-3** Dado Progreso → Medidas sin mediciones, entonces veo el estado vacío y el botón Nueva medición, aunque no existan sesiones de entrenamiento.
- **CA-4** Cuando guardo una medición con solo `cintura = 78,5`, entonces `S.measures` tiene una entrada con `values = { cintura: 78.5 }` y se persiste en `localStorage`.
- **CA-5** Cuando intento guardar sin ningún valor, entonces no se guarda y se avisa con un toast.
- **CA-6** Valores fuera de rango (cm fuera de 5–300; kg fuera de 20–500) o no numéricos se rechazan indicando el campo.
- **CA-7** Se acepta `78,5` y `78.5` como el mismo valor.
- **CA-8** Dada una medición previa, cuando abro Nueva medición, entonces los campos están vacíos pero muestran el último valor como sugerencia, la fecha es hoy, y pulsar + en un campo vacío lo deja en ese valor + 0,5.
- **CA-9** Dadas dos mediciones de cintura (80 y 78,5), entonces la lista muestra `−1,5 cm` en la más reciente, y la variación se calcula contra la anterior que **tenga esa medida**, aunque no sea la inmediata.
- **CA-10** Dado que la medición más reciente no incluye `pecho`, entonces los tiles de `pecho` usan la última medición que sí lo incluye.
- **CA-11** Cuando edito una medición cambiando la fecha, entonces `S.measures` sigue ordenada por fecha.
- **CA-12** Cuando elimino una medición y confirmo, entonces desaparece; si cancelo, no.
- **CA-13** Con una sola medición de una medida, la gráfica se dibuja sin errores y la variación se muestra como `—`.
- **CA-14** El texto de usuario (nota) se escapa con `esc()` en lista y sheet.
- **CA-15** Exportar y reimportar conserva las mediciones.
- **CA-16** Dado el sheet de medición, cuando pulso ⓘ de un campo, entonces se despliega su guía (texto + imagen) bajo el campo sin cerrar el sheet ni borrar valores ya escritos.
- **CA-17** Cuando pulso ⓘ de otro campo, entonces se pliega la guía anterior y se abre la nueva; pulsar el mismo ⓘ otra vez la pliega.
- **CA-18** `bicepsI` y `bicepsD` (y los otros pares) muestran la misma imagen y texto.
- **CA-19** Toda medida de `MEASURES` tiene `guia` no vacía; toda `img` declarada existe en `assets/medidas/` y está listada en `ASSETS` de `sw.js`.
- **CA-20** Si una imagen falla al cargar, el texto de la guía sigue visible y el sheet no se rompe.
- **CA-21** El peso corporal muestra solo texto, sin imagen rota.

## Tareas
- [x] Generar las 9 imágenes (prompt en `specs/002-medidas-imagenes-prompt.md`), convertirlas a WebP 512×512 y guardarlas en `assets/medidas/`. Hecho: 5-10 KB cada una. La de cadera salió vertical y se recortó a cuadrado. Los PNG originales (1254 px, ~1,4 MB) quedan fuera del repo, en `Downloads\Imagenes`.
- [x] Tests CA-1…CA-21 (primero, rojos).
- [x] Ajustar los tests de la 001: con la pestaña Medidas ya hay dos secciones, así que sus tests parten de `PROG_TABS` con solo Ejercicios.
- [x] `MEASURES`, `S.measures` y `migrate()`.
- [x] Pestaña Medidas en `PROG_TABS` y `renderProgMedidas()`.
- [x] Sheet de alta/edición + `ACT` (`measureNew`, `measureEdit`, `measureSave`, `measureDel`).
- [x] Reutilizar `chartSVG` y los estilos `tiles`/`plist`; añadir solo el CSS imprescindible.
- [x] Actualizar CLAUDE.md (forma de `S`) y subir `CACHE`/`APP_VERSION`.

## Riesgos y decisiones abiertas
- **Antebrazo y pantorrilla** se asumen también izquierda/derecha (se pidió separar lados). Si prefieres un solo valor, solo cambia `MEASURES`.
- **Varias mediciones el mismo día**: se permiten, sin fusionarlas. Más simple y no pierde datos.
- **Imágenes generadas con IA**: pueden salir inconsistentes entre sí o con anatomía incorrecta. Se revisan a mano una a una; el texto de la guía es la fuente fiable y la imagen solo ilustra. Las imágenes deben ser generadas sin texto incrustado.
- **Filtros de contenido del generador**: las ilustraciones de torso/cadera pueden ser rechazadas. Plan B sin IA: diagramas SVG propios (silueta neutra + línea de cinta dibujada en la posición exacta, con zoom en brazos y piernas). Pesan unos pocos KB, se ven nítidos en cualquier pantalla, respetan el tema claro/oscuro y no dependen de ningún servicio. Si 003 ya está hecha, la silueta puede salir de `body-paths.js`.
- **Peso de la app**: las 9 imágenes suman ~65 KB en caché. Despreciable.
- **Posición de ⓘ en pantallas estrechas**: el botón debe tener área táctil ≥ 40 px sin descuadrar los steppers ±.
- La gráfica de `chartSVG` pinta el eje Y con `Math.max(0, …)` como mínimo; para medidas con poca variación (p. ej. 78–80 cm) la curva puede verse plana. Se valida visualmente y, si hace falta, se ajusta el rango en esta spec.
