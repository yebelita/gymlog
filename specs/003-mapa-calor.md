# 003 · Mapa de calor muscular
Estado: hecha (Fase A en v6, Fase B en v7, Fase C en v8)
Depende de: 001 (pestañas de Progreso)

## Objetivo
En **Progreso → Músculos**, mostrar un cuerpo (frente y espalda, **hombre o mujer a elección**) con cada músculo coloreado según cuánto se ha trabajado en los últimos 7 o 30 días, y ver de un vistazo qué músculos se están descuidando. Funciona con el **historial que ya existe**, sin que el usuario tenga que reentrenar ni reeditar nada.

## Fuera de alcance
- Fatiga/recuperación por músculo, objetivos semanales de series, subgrupos musculares (pecho superior, etc.).
- Más de dos siluetas (solo hombre/mujer).
- Traducir los ~1.300 nombres del catálogo al español.
- Sincronización entre dispositivos.

## Decisiones de diseño

### 1. Qué se mide
- **Series efectivas** por músculo = suma de series *hechas* × peso del músculo en ese ejercicio. Peso **1,0** si es principal y **0,4** si es secundario (si un músculo es ambos, vale el mayor). No se usa volumen en kg: las series por músculo son la medida estándar y funcionan igual para peso, reps y tiempo.
- Ventana **móvil**: 7 o 30 días terminando hoy (hoy incluido). Por defecto 7. La elección vive en una variable de módulo (como `progTab`), no en `S`.
- Solo cuentan sesiones **terminadas** (`S.sessions`), no la activa.
- **Niveles 0-4 relativos al máximo** de la ventana: 0 = sin trabajo; 1-4 = `ceil(valor / máximo × 4)`; el músculo más trabajado es siempre 4. Un mapa relativo responde "¿qué he descuidado?", que es el objetivo.

### 2. De dónde salen los músculos de un ejercicio
Las sesiones guardadas solo conservan el **nombre** del ejercicio y los ejercicios enlazan por nombre normalizado (`norm`), así que el mapeo se guarda también por nombre, no dentro de cada ejercicio. Así **todo el historial se colorea de inmediato** y renombrar o duplicar ejercicios no rompe nada.

`S.exMuscles = { [norm(nombre)]: { p: [slugs], s: [slugs] } }` guarda lo que el usuario decide. Resolución, de mayor a menor prioridad:
1. **Usuario** (`S.exMuscles`). `{ p: [], s: [] }` significa "sin músculos" a propósito (cardio, movilidad) y no se trata como sin clasificar.
2. **Curado** para los 33 ejercicios de la rutina por defecto (Apéndice A).
3. **Palabras clave en español** (Apéndice B), primera regla que coincide.
4. **Sin clasificar**: no suma y se lista en la pestaña para asignarlo.

### 3. Músculos (18, los que sabe dibujar el SVG)
`trapezius, deltoids, chest, upper-back, serratus, biceps, triceps, forearm, abs, obliques, lower-back, gluteal, quadriceps, hamstring, adductors, hip-flexors, calves, tibialis`, con etiquetas en español (`MUSCLE_ES`: Trapecio, Hombros, Pecho, Dorsales y espalda alta, Serrato, Bíceps, Tríceps, Antebrazos, Abdomen, Oblicuos, Lumbar, Glúteos, Cuádriceps, Isquios, Aductores, Flexores de cadera, Gemelos, Tibiales). Partes que no son músculo (cabeza, pelo, cuello, manos, pies, rodillas, tobillos) se dibujan como silueta y **nunca** toman color.

### 4. Geometría del cuerpo
- Los paths SVG proceden de **MuscleMap (Melih Colpan, MIT)**, `Sources/MuscleMap/Data/{Male,Female}{Front,Back}Paths.swift`. Se genera `src/body-paths.js` con un script propio (`scripts/build-body-paths.mjs`) que lee esos 4 archivos; no se copia código de otros proyectos.
- Los subgrupos de MuscleMap (pecho superior, cuádriceps interno…) se superponen al músculo completo, que ya trae su propio trazo en cada vista: se **descartan** si existe el padre en esa vista y se fusionan en él solo si falta (hoy no ocurre).
- Formato: `var BODY_PATHS = { male: { front: { vb, p: { slug: [d, …] } }, back: … }, female: … }` (~90 KB; si hace falta se redondean coordenadas).
- Se carga con `<script src="src/body-paths.js">` síncrono antes del script principal (sin build), y se añade a `ASSETS` del service worker. Es un asset más del APK de la spec 004.
- **Tests:** el helper `loadApp` lee `index.html` como texto con URL `http://localhost/`, así que jsdom no cargaría el script externo. El helper inlinará los `<script src>` locales antes de crear el JSDOM (cambio pequeño en `tests/helpers/app.js`).

### 5. Interfaz (pestaña "Músculos", entre Ejercicios y Medidas)
- Selector **Hombre / Mujer** (`S.settings.bodyGender`, `'male'` por defecto, persistente) y selector **7 días / 30 días**.
- Dos SVG lado a lado (frente y espalda). Cada músculo con clase `l0…l4`; escala de 4 pasos de un mismo color más leyenda "Menos … Más".
- Tocar un músculo muestra debajo su nombre, las series efectivas (`12,4 series`) y los ejercicios que aportan; tocar otro lo cambia, tocar el mismo lo cierra.
- **Más trabajados** (ranking con series) y **Sin trabajar** (chips de nivel 0).
- **Sin clasificar (N)**: lista de nombres con sus series; tocar uno abre el sheet de músculos.
- **Sheet de músculos** (`muscleSheet(nombre)`): 18 chips con ciclo apagado → principal → secundario → apagado, botón "Restablecer a sugerido" (borra el override) y Guardar. Se usa desde la pestaña y desde el editor de ejercicio (que gana una sección "Músculos" que lo abre).
- Si se renombra un ejercicio y el usuario elige renombrar también el historial, el mapeo se mueve al nombre nuevo si éste no tiene uno propio.
- Accesibilidad: cada músculo tiene `role="button"`, `tabindex="0"`, `aria-label` ("Glúteos, 12,4 series") y se activa con Enter/Espacio.

### 6. Fases (cada una se publica por separado)
- **Fase A (v6):** todo lo anterior, usando curado + palabras clave + asignación manual, con `NOTICE.md` (aviso de MuscleMap) y la pantalla de créditos.
- **Fase B (v7):** **catálogo** de ejercicios y buscador (ver siguiente sección); añade el aviso del dataset a los créditos.

### 7. Catálogo de ejercicios (Fase B)
- Se filtra el dataset `exercises.json` (1.324 ejercicios, MIT) con `scripts/build-catalog.mjs <ruta al json>` y se genera `src/exercise-catalog.js` (`var EX_CATALOG = [[nombre, [principales], [secundarios]], …]`). Solo se conservan nombre (inglés), `target` (principal) y `secondary_muscles`; se ignoran `muscle_group` (ruidoso), instrucciones, imágenes y GIFs (los medios tienen términos de uso restrictivos y no se usan). Se descartan entradas sin ningún músculo dibujable. Tamaño objetivo < 120 KB.
- Normalización propia (Apéndice C) hacia los 18 slugs, y luego las **correcciones** de `scripts/catalog-overrides.json` (por id: reemplazan `p`/`s` o excluyen la entrada). Se corrigen los errores conocidos del dataset, p. ej. todos los *hack squat* (cuádriceps como principal).
- **Ejercicios propios** (`scripts/catalog-extras.json`): entradas que faltan en el dataset, con ids `x01`, `x02`… y formato `{ "id": "x02", "n": "cable donkey kickback", "es": "patada de glúteo en polea", "alias": ["patada de gluteo", "glute kickback", "kickback gluteo"], "p": ["gluteal"], "s": ["hamstring"] }`. El nombre en español y los alias entran en la búsqueda, así que estas entradas se encuentran escribiendo en español. Primera tanda: `x01` barbell hip thrust, `x02` cable donkey kickback, `x03` cable face pull. Se amplía cuando el script de comparación (ver tareas) o el uso revelen ejercicios que falten. Son datos propios: no requieren atribución.
- Buscador dentro del sheet de músculos: texto sin acentos ni mayúsculas; los nombres del catálogo están en inglés, así que una tabla pequeña de sinónimos ES→EN (sentadilla→squat, remo→row, jalón→pulldown, peso muerto→deadlift, press→press, curl→curl, zancada→lunge, elevaciones→raise, patada→kickback, plancha→plank…) amplía la consulta. Máximo 20 resultados; elegir uno **copia** principales/secundarios al sheet sin guardar hasta pulsar Guardar.
- **Créditos:** `NOTICE.md` en la raíz con los textos MIT de MuscleMap (desde la Fase A, porque ya se distribuyen sus trazos) y del dataset (Fase B), y una entrada "Créditos y licencias" en Ajustes que los muestra (necesario para el APK).

## Criterios de aceptación

### Datos y migración
- **CA-1** `S.settings.bodyGender` vale `'male'` por defecto; `migrate()` conserva `'female'` y reemplaza cualquier otro valor por `'male'`.
- **CA-2** `S.exMuscles` vale `{}` por defecto. `migrate()` descarta entradas que no son objeto, ignora slugs desconocidos, convierte `p`/`s` no-array en `[]` y **conserva** `{ p: [], s: [] }`.
- **CA-3** El mapeo se guarda y se busca por `norm(nombre)` (mayúsculas y espacios de más no importan).
- **CA-4** `exMuscles` se exporta e importa con el respaldo.

### Resolución de músculos
- **CA-5** Prioridad: usuario > curado > palabras clave > sin clasificar.
- **CA-6** Los 33 ejercicios de la rutina por defecto resuelven por el mapeo curado; `Caminata inclinada` y `Movilidad` resuelven a "sin músculos" a propósito.
- **CA-7** Palabras clave: casos de ejemplo (p. ej. «Sentadilla búlgara» → cuádriceps/glúteos; «Press inclinado con mancuernas» → pecho; «Elevación de talones» → gemelos), insensibles a acentos y mayúsculas; un nombre sin coincidencia queda sin clasificar.
- **CA-8** Peso 1,0 principal y 0,4 secundario; si un músculo está en ambos, vale 1,0.

### Cálculo
- **CA-9** Carga = series hechas × peso. Una sesión de hace 8 días cuenta en 30 días y no en 7; una de hoy cuenta en ambas.
- **CA-10** La sesión activa no cuenta.
- **CA-11** Niveles: 0 si no hay carga; 1-4 con `ceil(valor / máximo × 4)`; el máximo es 4.
- **CA-12** Los ejercicios sin clasificar no suman y se listan una vez por nombre con su número de series; los de "sin músculos" a propósito no aparecen en esa lista.
- **CA-13** Sin sesiones en la ventana: cuerpo en gris, mensaje de vacío y sin errores.

### Vista
- **CA-14** `PROG_TABS` incluye "Músculos" entre Ejercicios y Medidas; funciona sin sesiones.
- **CA-15** Cambiar Hombre/Mujer persiste en `S.settings.bodyGender` y repinta con la silueta correspondiente; hay siempre dos SVG (frente y espalda).
- **CA-16** Cambiar 7/30 días recalcula sin tocar `S`.
- **CA-17** Los músculos con nivel N llevan clase `lN`; los de nivel 0, `l0`; las partes inertes no llevan clase de calor.
- **CA-18** Tocar un músculo muestra nombre en español, series con coma decimal y los ejercicios que aportan; tocar el mismo lo cierra.
- **CA-19** «Más trabajados» ordena de mayor a menor carga; «Sin trabajar» lista los de nivel 0 en orden de cuerpo.
- **CA-20** Cada músculo tiene `role="button"`, `tabindex` y `aria-label`; Enter/Espacio lo activan.
- **CA-21** `BODY_PATHS` define las 4 vistas, y cada uno de los 18 músculos tiene paths en al menos una vista de cada sexo.

### Asignación manual
- **CA-22** Desde "Sin clasificar" tocar un nombre abre el sheet; los chips ciclan apagado → principal → secundario → apagado; Guardar escribe `S.exMuscles[norm]` y el ejercicio pasa a contar al instante.
- **CA-23** "Restablecer a sugerido" borra el override y vuelve al curado o a las palabras clave.
- **CA-24** El editor de ejercicio muestra la sección "Músculos" con la resolución actual y permite abrir el sheet.
- **CA-25** Renombrar mueve el mapeo del usuario al nombre nuevo solo si éste no tenía uno propio. Con historial, al aceptar renombrarlo; sin historial del nombre anterior, directamente. El mapeo del nombre anterior se elimina solo si ya no lo usa ningún ejercicio de la rutina ni del historial (p. ej. «Face pull» aparece en dos días).

### Carga de recursos (Fase A)
- **CA-26** `src/body-paths.js` se carga por `<script src>`, está en `ASSETS` de `sw.js` y los tests siguen cargando la app (helper que inlinea scripts locales).
- **CA-26b** `NOTICE.md` existe con el aviso MIT de MuscleMap y Ajustes muestra «Créditos y licencias» con él.

### Catálogo (Fase B)
- **CA-27** `build-catalog.mjs` con un dataset de prueba produce un catálogo determinista que solo contiene entradas con músculos dibujables y slugs válidos.
- **CA-27c** Los ejercicios de `catalog-extras.json` aparecen en el catálogo con su nombre en español, se encuentran buscando por nombre o alias en español (p. ej. «patada de glúteo» → `x02`), y sus ids no colisionan con los del dataset.
- **CA-27b** Las correcciones de `catalog-overrides.json` se aplican sobre el dataset (reemplazo de `p`/`s` y `drop`); cada id corregido existe en el dataset y usa slugs válidos (si no, el script falla con un error claro).
- **CA-28** El buscador devuelve ≤ 20 resultados, sin acentos ni mayúsculas; «sentadilla» devuelve entradas de «squat».
- **CA-29** Elegir un resultado rellena los chips pero no guarda hasta pulsar Guardar.
- **CA-30** `NOTICE.md` contiene también el aviso MIT del dataset y «Créditos y licencias» lo muestra.

## Tareas
### Fase A
- [x] Helper de tests: inlinear `<script src>` locales.
- [x] `scripts/build-body-paths.mjs` y `src/body-paths.js` (generado, 93,8 KB; los 18 músculos se dibujan en ambos sexos).
- [x] `NOTICE.md` (MuscleMap) y pantalla de créditos.
- [x] Tests CA-1…CA-26b (rojos primero).
- [x] `S.settings.bodyGender`, `S.exMuscles` y `migrate()`; actualizar `tests/state.test.js` (ajustes por defecto) y `tests/progress-tabs.test.js` (claves de `S`).
- [x] Datos: `MUSCLES`, `MUSCLE_ES`, mapeo curado, reglas de palabras clave, `musclesFor(nombre)`.
- [x] Cálculo: `muscleLoad(ventana)` y `levelsOf(carga)`.
- [x] Pestaña Músculos, `muscleSheet()`, sección en el editor de ejercicio, renombrado.
- [x] CSS de niveles + leyenda; revisión visual en móvil.
- [x] Subir `CACHE`/`APP_VERSION`; actualizar CLAUDE.md.
### Fase B
- [x] `scripts/build-catalog.mjs`, `scripts/catalog-overrides.json`, `scripts/catalog-extras.json` (primera tanda `x01`-`x03`) y `src/exercise-catalog.js` (generado), tag `<script>` y `ASSETS`.
- [x] Revisar con el usuario las discrepancias que liste el script al comparar la tabla curada con el dataset.
- [x] Buscador, sinónimos ES→EN.
- [x] Añadir el aviso del dataset a `NOTICE.md` y a los créditos.
- [x] Tests CA-27…CA-30 (incluye CA-27b y CA-27c); subir versión.

## Fase C · Crear ejercicios desde el catálogo (v8)
Hoy el catálogo solo sirve para copiar **músculos** a un ejercicio ya existente; al pulsar «+ Ejercicio» el nombre sigue siendo texto libre. Esta fase permite **elegir el ejercicio en el catálogo al crearlo**.

### Diseño
- Al **crear** un ejercicio (`editEx` con `xi < 0`), el sheet muestra arriba un buscador del catálogo (mismo `catSearch`). Elegir un resultado rellena:
  - **Nombre:** el nombre en español si el resultado lo tiene (ejercicios propios `x01`…); si no, el nombre en inglés con la primera letra en mayúscula.
  - **Músculos:** copia principales/secundarios a los chips y despliega «Músculos que trabaja» para verlos.
  - **Tipo:** si el resultado trae una sugerencia (`reps` o `tiempo`) se selecciona; si no, se mantiene el que hubiera.
  - No se guarda nada hasta pulsar **Guardar**. Series, objetivo y descanso siguen siendo los valores por defecto del formulario (el dataset no los trae).
- Al **editar** un ejercicio existente no aparece este buscador: cambiar el nombre por error rompería el enlace con su historial. Allí sigue el buscador de la sección «Músculos» (solo copia músculos). En un ejercicio nuevo esa sección no repite el buscador.
- **Sugerencia de tipo**: el catálogo gana un 7.º campo opcional `mode`. `build-catalog.mjs` lo calcula desde `equipment` del dataset: `body weight` → `reps`; nombres con `plank`, `isometric`, `wall sit` o `hold` → `tiempo` (no `hang`, que coge *hang clean*, un ejercicio de repeticiones). Los ejercicios propios y las correcciones por id pueden fijarlo (`"mode": "reps"|"tiempo"`). Entrada: `[id, nombre, principales, secundarios, es, alias, mode]` (los vacíos del final se recortan).
- El nombre elegido se puede editar antes de guardar: se respeta lo editado y los músculos se guardan bajo ese nombre.

### Criterios de aceptación
- **CA-31** Al crear un ejercicio el sheet muestra el buscador del catálogo arriba y la sección «Músculos» no lo repite; al editar uno existente no se muestra el de arriba y la sección «Músculos» sí tiene el suyo.
- **CA-32** Elegir un resultado rellena el nombre (en español si existe; si no, en inglés con mayúscula inicial), copia los músculos a los chips, despliega la sección, vacía la lista de resultados y no guarda nada hasta Guardar.
- **CA-33** Si el resultado trae tipo, se selecciona (`reps` para peso corporal, `tiempo` para isométricos); si no, se mantiene el tipo que hubiera. El usuario puede cambiarlo después.
- **CA-34** Guardar añade el ejercicio al día con ese nombre y tipo y guarda sus músculos en `S.exMuscles`; si el usuario edita el nombre tras elegir, se respeta lo editado y los músculos se guardan bajo ese nombre.
- **CA-35** `build-catalog.mjs` genera `mode` desde `equipment` y los nombres isométricos, lo admite en extras y en correcciones por id, rechaza valores inválidos, y no añade el campo cuando no hay sugerencia.
- **CA-35b** En el catálogo real, las entradas de peso corporal llevan `reps` y las planchas `tiempo`; el catálogo sigue pesando menos de 120 KB.

### Tareas
- [x] Tests CA-31…CA-35b (rojos primero).
- [x] `build-catalog.mjs`: campo `mode`; regenerar `src/exercise-catalog.js`.
- [x] Buscador al crear un ejercicio (`catPick`), parametrizando `catBlockHTML`/`catBind`.
- [x] Subir `CACHE`/`APP_VERSION` (v8); actualizar CLAUDE.md.

### Notas de la implementación
- «Push-up to side plank» (0664) contiene *plank* pero es de repeticiones: se corrige a `reps` con una corrección por id en `catalog-overrides.json`. Si aparecen más casos así, se corrigen igual.
- Al elegir un resultado se vacía el buscador y se muestra un aviso («Rellenado: ajusta series y descanso, y pulsa Guardar»). El catálogo pasó a 98 KB (296 entradas con tipo sugerido).
- Los músculos copiados se guardan en `S.exMuscles` al pulsar Guardar, aunque no los cambies: el catálogo es solo un selector y no participa en la resolución de músculos, así que sin esa copia el ejercicio nuevo se clasificaría por palabras clave.

## Añadido durante la implementación (Fase A)
- En el detalle de un músculo, cada ejercicio que aporta es tocable (✎) y abre la hoja de músculos, para corregir una clasificación justo donde se detecta el error.
- Los puntos «Más trabajados» y «Sin trabajar» también seleccionan el músculo en el mapa.

## Añadido durante la implementación (Fase B)
- **Correcciones por reglas, no solo por id.** La auditoría mostró que el ruido del dataset es sistemático (sentadillas: glúteos como principal en 45 casos y cuádriceps en 27; prensa de piernas: 6 glúteos y 1 cuádriceps), así que `catalog-overrides.json` tiene `rules` (por nombre, con `whenTarget` opcional; gana la primera que coincide) además de `ids` (última palabra). Reglas actuales: *hack squat*, *leg press* y *squat*.
- **Descartes:** 29 de 1.324 entradas, todas cardio (`cardiovascular system`) sin músculo principal dibujable. El catálogo queda en 94 KB con 1.295 + 4 propios.
- **Cuarto ejercicio propio:** `x04` *bulgarian split squat* («sentadilla búlgara»), porque el dataset solo trae una variante con banda.
- **Algoritmo de búsqueda** (`catSearch`): ignora acentos, mayúsculas, paréntesis y números sueltos; traduce frases (`peso muerto` → *deadlift*) y palabras españolas a sus equivalentes en inglés (plurales incluidos); en consultas de 1-2 palabras exige todas, y en las más largas basta con la mitad, ordenando por número de coincidencias. Esto es lo que permite encontrar nombres naturales como «Hip thrust (pausa de 1 s arriba)».
- **Cobertura comprobada por test (CA-28c):** los 33 ejercicios de la rutina por defecto se encuentran, salvo «Caminata inclinada» y «Movilidad» (sin músculos, excluidos a propósito).
- **El buscador también está en el editor de ejercicio** (dentro de «Músculos que trabaja»), no solo en la hoja de músculos; al elegir un resultado se despliega la sección para ver lo copiado.
- El catálogo se escribió antes que sus tests (por ser datos generados); los tests se verificaron después con el fallo real que destapó CA-28c.

## Riesgos y decisiones abiertas
- **Formato de los `.swift` de MuscleMap**: resuelto. Es regular (bloques `BodyPartPathData` con `common/left/right`) y el conversor funciona; ver `scripts/build-body-paths.mjs`.
- **Calidad de la clasificación**: los nombres libres en español nunca se clasificarán bien al 100 %. Por eso existe "Sin clasificar" visible y editable, en lugar de adivinar en silencio.
- **Foco del teclado**: al pulsar un músculo la pestaña se repinta completa y el foco vuelve al inicio; se acepta en la Fase A y se puede mejorar repintando solo el cuerpo.
- **Escala relativa**: con pocas series el músculo más trabajado siempre sale al máximo aunque sea poco volumen; se muestra el número de series para dar contexto.
- **Paleta**: la escala de color (4 pasos más el neutro) se decide al ver el resultado en pantalla; debe distinguirse con luz solar y en tamaño pequeño.
- **Dos figuras lado a lado en móvil** miden ~190 px de ancho; si resultan pequeñas, alternativa: selector Frente/Espalda de a una.
- **Licencias**: el código de openGym es AGPL y **no se copia**; solo se usan datos MIT (MuscleMap y el dataset) con su atribución.

## Apéndice A · Mapeo curado (rutina por defecto)
`p` = principales, `s` = secundarios (nombres en inglés = slugs de la sección 3).
| Ejercicio | p | s |
|---|---|---|
| Hip thrust con barra / Hip thrust (pausa de 1 s arriba) | gluteal | hamstring, adductors |
| Peso muerto rumano con barra / unilateral | hamstring, gluteal | lower-back |
| Búlgaras | quadriceps, gluteal | hamstring, adductors |
| Step-up | quadriceps, gluteal | hamstring |
| Abducción en máquina / Patada en polea | gluteal | — |
| Remo con barra inclinado | upper-back | trapezius, biceps, lower-back, deltoids |
| Jalón al pecho, agarre neutro / Jalón al pecho o dominadas asistidas | upper-back | biceps, forearm |
| Remo en polea / Remo en cable | upper-back | biceps, trapezius |
| Remo pecho apoyado o con mancuerna | upper-back | trapezius, biceps, deltoids |
| Pullover en polea | upper-back | triceps |
| Face pull | deltoids, trapezius | upper-back |
| Reverse fly en máquina | deltoids | trapezius, upper-back |
| Curl martillo / Curl de bíceps | biceps | forearm |
| Hack | quadriceps | gluteal |
| Prensa | quadriceps | gluteal, hamstring |
| Extensión de cuádriceps | quadriceps | — |
| Curl femoral | hamstring | calves |
| Aductor | adductors | — |
| Plancha | abs | obliques, lower-back |
| Pallof Press | obliques, abs | — |
| Dead Bug | abs | hip-flexors |
| Press militar | deltoids | triceps, trapezius |
| Press banca con mancuernas | chest | triceps, deltoids |
| Elevaciones laterales | deltoids | — |
| Extensión de tríceps | triceps | — |
| Caminata inclinada, Movilidad | — (sin músculos a propósito) | — |

**Dónde se resuelven las discrepancias (decidido):** hay tres capas, según de quién sea el dato.
1. **Los 33 ejercicios por defecto:** en esta tabla. Manda el criterio del usuario; el dataset no interviene.
2. **El catálogo:** en dos archivos del repositorio que `build-catalog.mjs` aplica sobre el dataset, de modo que regenerar el catálogo conserva todo:
   - `scripts/catalog-overrides.json`: corrige o excluye entradas del dataset por id (`{ "0743": { "p": ["quadriceps"], "s": ["gluteal", "hamstring", "calves"] } }`, `{ "drop": true }`, o `{ "alias": ["hack", "máquina hack"] }` para añadir términos de búsqueda).
   - `scripts/catalog-extras.json`: ejercicios que el dataset **no tiene**, añadidos por nosotros (ver sección 7).
3. **Cada usuario:** en `S.exMuscles`, que gana siempre.

**Equivalencias y correcciones conocidas** (ids del dataset `exercises.json`):
| Ejercicio de GymLog | Entrada del dataset | Nota |
|---|---|---|
| Hack | 0743 *sled hack squat* (máquina) | El dataset da **glúteos** como principal en todos los hack squat (0046, 0741, 0743, 0755); se corrigen a cuádriceps principal en `catalog-overrides.json`. |
| Patada en polea | extra `x02` *cable donkey kickback* | El dataset no tiene patada de glúteo: **no** usar *cable kickback* (0860), que es de tríceps, como todos los *kickback* del dataset. Lo más cercano es 0228 *cable standing hip extension*. |
| Hip thrust con barra | extra `x01` *barbell hip thrust* | No hay *barbell hip thrust* en el dataset (lo más cercano es 1409 *barbell glute bridge*). |
| Jalón al pecho | 0198 *cable pulldown* / 2330 *cable lat pulldown full range of motion* | Coincide con la tabla. |
| Face pull | extra `x03` *cable face pull* | Sin equivalente en el dataset. |

**Relación con el catálogo (decidido):** este mapeo curado **no se deriva ni se sustituye** por el dataset. El catálogo (Fase B) solo sirve para buscar y copiar músculos a un ejercicio, y esa elección se guarda como asignación del usuario (gana al curado; "Restablecer a sugerido" vuelve al curado). Motivo: al comparar esta tabla con los equivalentes del dataset (23 encontrados de 26), el músculo principal coincide en 21; las 2 diferencias son ruido del dataset (p. ej. «barbell hack squat» con glúteos como principal), y los secundarios difieren bastante (deltoides en una plancha, antebrazo en casi todos los remos). Además, hip thrust con barra, jalón al pecho y face pull no tienen equivalente claro y los nombres están en inglés, por lo que enlazarlos habría que hacerlo a mano igualmente.

## Apéndice B · Palabras clave (primera coincidencia gana, sin acentos)
Orden de más a menos específico; cada regla da `p` y `s`:
`extensi[oó]n de cu[aá]driceps`→quadriceps · `curl femoral|isquio`→hamstring · `peso muerto`→hamstring, gluteal / lower-back · `hip thrust|puente de gl[uú]teo|patada|glute`→gluteal · `abducci[oó]n|abductor`→gluteal · `aductor`→adductors · `sentadilla|zancada|prensa|hack|step`→quadriceps, gluteal / hamstring · `press (de )?banca|press inclinado|aperturas|fondos|pecho`→chest / triceps, deltoids · `press militar|elevaciones laterales|p[aá]jaros|face pull|hombro`→deltoids · `remo|jal[oó]n|dominadas|pullover`→upper-back / biceps · `curl|b[ií]ceps`→biceps / forearm · `tr[ií]ceps|franc[eé]s`→triceps · `gemelo|pantorrilla|talones`→calves · `plancha|abdominal|crunch|core`→abs · `oblicuo|pallof`→obliques · `encogimientos|trapecio`→trapezius · `lumbar|hiperextensi[oó]n`→lower-back · `antebrazo|mu[ñn]eca`→forearm.

## Apéndice C · Normalización del dataset → slugs
- **target (principal):** abs→abs · pectorals→chest · biceps→biceps · glutes→gluteal · delts→deltoids · triceps→triceps · upper back→upper-back · lats→upper-back · calves→calves · quads→quadriceps · forearms→forearm · hamstrings→hamstring · spine→lower-back · traps→trapezius · adductors→adductors · serratus anterior→serratus · abductors→gluteal · levator scapulae→trapezius · cardiovascular system→(descartado).
- **secondary_muscles:** hip flexors→hip-flexors · lower back→lower-back · obliques→obliques · rhomboids, back, lats, latissimus dorsi, upper back→upper-back · shoulders, deltoids, rear deltoids, rotator cuff→deltoids · core, abdominals, lower abs→abs · chest, upper chest→chest · traps, trapezius→trapezius · brachialis→biceps · inner thighs, groin→adductors · soleus→calves · shins→tibialis · wrist flexors, wrist extensors, grip muscles→forearm · glutes, hamstrings, quadriceps, calves, biceps, triceps, forearms→su equivalente · ankles, feet, ankle stabilizers, hands, wrists, sternocleidomastoid→(descartados).
