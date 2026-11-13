# Prompt para generar las imágenes de "cómo medir" (spec 002)

Se pega en ChatGPT (generador de imágenes). Conviene hacerlo en **una sola conversación** para que el estilo se mantenga. Primero se pega el bloque de estilo y se genera la imagen 1; cuando el estilo esté aprobado, se pide el resto una a una.

## 1. Bloque de estilo (pegar primero)

```
I need a set of 9 instructional illustrations for a fitness app, showing where to place a measuring tape on the human body. All 9 must look like they belong to the same set, so please lock the style below and reuse it for every image I ask for.

STYLE (apply to ALL images):
- Square format, 1:1, 1024x1024 px.
- Flat vector illustration, clean and minimal, modern fitness-app look. Soft shading only; no photorealism, no gradients on the background, no outlines that look hand-drawn.
- One gender-neutral, featureless mannequin: smooth faceless head, no hair, no clothes details, neutral athletic build. Body color light grey-blue (#c7ccd8) with subtle shading.
- Background: solid dark navy #181b22, nothing else. No border, no frame, no floor, no shadow on the background.
- The measuring tape: a flexible tape drawn as a bright green band (#34d399) with small regular tick marks, wrapped snugly around the body part (snug, not squeezing the skin), seen so that the exact path of the tape is clear. Add a small buckle/overlap where the tape ends cross. The tape is parallel to the floor unless I say otherwise.
- Draw the body part being measured large and centered, with about 15% empty margin around it. The rest of the body can be cropped by the frame. Keep the camera and lighting identical across images (soft light from the upper left).
- IMPORTANT: absolutely NO text, numbers, letters, logos, scale numerals, arrows with labels or watermarks anywhere in the image. The tape has tick marks only, no digits.
- Arms and posture are relaxed and natural unless I say otherwise.

Reply "ready" and then wait. I will ask for the images one at a time.
```

## 2. Imágenes (pedir de una en una, tras aprobar el estilo)

Plantilla: `Same style as before. Image N of 9: <descripción>. No text anywhere.`

| # | Archivo | Descripción para el prompt |
|---|---|---|
| 1 | `cuello.webp` | Head and neck of the mannequin, front-three-quarter view. Tape wraps around the neck just below the Adam's apple, horizontal. Head straight, looking forward, shoulders relaxed. |
| 2 | `hombros.webp` | Upper torso from the front, arms hanging relaxed at the sides. Tape runs around the widest part of the shoulders (over the deltoids), passing across the chest and around the back. |
| 3 | `pecho.webp` | Torso from the front, arms slightly away from the body. Tape wraps around the chest at nipple level, under the armpits, horizontal all the way around the back. |
| 4 | `cintura.webp` | Torso from the front, relaxed stomach. Tape wraps horizontally around the waist at navel height. |
| 5 | `cadera.webp` | Hips and upper thighs from the front, feet together. Tape wraps horizontally around the widest part of the hips and glutes. |
| 6 | `biceps.webp` | One arm hanging relaxed at the side, side-front view, shoulder to elbow visible. Tape wraps around the upper arm at the halfway point between shoulder and elbow. |
| 7 | `antebrazo.webp` | One forearm relaxed at the side, palm facing the thigh, elbow to wrist visible. Tape wraps around the thickest part of the forearm, near the elbow. |
| 8 | `muslo.webp` | Standing legs from the front, weight evenly on both legs, hip to knee visible. Tape wraps around one thigh at the halfway point between hip and knee. |
| 9 | `pantorrilla.webp` | Lower leg seen from the side-back, standing, knee to ankle visible. Tape wraps around the thickest part of the calf. |

## 2a. Versión suavizada (usar esta si el filtro de contenido bloquea las anteriores)

La primera versión del bloque de estilo y de la Imagen A fue rechazada por la política de contenido (palabras como "nipple level", "glutes", "stomach" y un maniquí sin ropa). Esta versión viste al maniquí, usa lenguaje neutro y plantea el encuadre como una guía de sastrería/fisioterapia.

**Bloque de estilo suavizado:**
```
I'm building a fitness tracking app and need simple instructional illustrations, like the ones in a tailor's or physiotherapist's guide, showing where to place a measuring tape to take body measurements. All images must share one consistent style.

STYLE:
- Flat vector illustration, clean and minimal, modern app look. Soft flat shading, no photorealism.
- One gender-neutral art mannequin (smooth, faceless, no hair), wearing plain fitted grey athletic wear: a sleeveless top and shorts. Mannequin body color light grey-blue (#c7ccd8).
- Background: solid dark navy #181b22, nothing else. No frame, floor or shadows on the background.
- Measuring tape: flexible tape in bright green (#34d399) with small regular tick marks, wrapped snugly around the body part, horizontal unless stated.
- The measured body part is large and centered with some empty margin. Arms relaxed, neutral posture.
- Absolutely no text, numbers, letters, logos or watermarks anywhere.

Reply "ready" and wait.
```

**Prueba de estilo (3 figuras poco delicadas: cuello, bíceps, antebrazo):**
```
Generate ONE image, landscape 1536x1024, with 3 separate illustrations side by side, each on the same solid #181b22 background with clear empty space between them, no dividers and no text:
1. Head and neck with shoulders, front view. The tape wraps around the neck, horizontal.
2. One arm relaxed at the side, shoulder to elbow visible. The tape wraps around the upper arm halfway between shoulder and elbow.
3. One forearm relaxed at the side, elbow to wrist visible. The tape wraps around the thickest part of the forearm near the elbow.
```

Si el estilo gusta, seguir con el resto en grupos pequeños (hombros y pecho / cintura y cadera / muslo y pantorrilla) con estas sustituciones: pecho = "around the fullest part of the chest, under the arms", cintura = "around the waist, at belly-button height", cadera = "around the widest part of the hips, over the shorts". Si siguen bloqueando, pasar a la alternativa de diagramas SVG propios (ver spec 002, riesgos).

## 2b. Alternativa: varias figuras por imagen (mejor consistencia)

> ⚠️ Los prompts de esta sección usan un vocabulario que fue rechazado por el filtro; usar primero 2a.

Dos imágenes en formato apaisado 1536×1024 (3 columnas × 2 filas = celdas de ~512 px). Se pega el bloque de estilo del punto 1 y, a continuación, uno de estos:

**Imagen A (6 figuras: cuello, hombros, pecho, cintura, cadera, bíceps)**
```
Now generate ONE single image, landscape 1536x1024, containing a grid of 6 separate illustrations in 3 columns x 2 rows, all in the style defined above. Each illustration sits alone in its own cell on the same solid #181b22 background, centered, with clear empty background space (at least 60 px) between neighbours so each one can be cropped out. No lines, frames, boxes or dividers between cells, and no text, numbers or letters anywhere.

Row 1, left to right:
1. Head and neck, front three-quarter view. Tape wraps around the neck just below the Adam's apple, horizontal.
2. Upper torso from the front, arms relaxed at the sides. Tape runs around the widest part of the shoulders (over the deltoids), across the chest and around the back.
3. Torso from the front, arms slightly away from the body. Tape wraps horizontally around the chest at nipple level, under the armpits.

Row 2, left to right:
4. Torso from the front, relaxed stomach. Tape wraps horizontally around the waist at navel height.
5. Hips and upper thighs from the front, feet together. Tape wraps horizontally around the widest part of the hips and glutes.
6. One arm hanging relaxed, side-front view, shoulder to elbow visible. Tape wraps around the upper arm halfway between shoulder and elbow.
```

**Imagen B (3 figuras: antebrazo, muslo, pantorrilla)**
```
Same style as before. Generate ONE single image, landscape 1536x1024, containing 3 separate illustrations side by side in one row, vertically centered, each on the same solid #181b22 background with clear empty space (at least 60 px) between them. No lines, frames or dividers, and no text, numbers or letters anywhere.

From left to right:
1. One forearm relaxed at the side, palm facing the thigh, elbow to wrist visible. Tape wraps around the thickest part of the forearm, near the elbow.
2. Standing legs from the front, weight evenly on both legs, hip to knee visible. Tape wraps around one thigh halfway between hip and knee.
3. Lower leg seen from the side-back, standing, knee to ankle visible. Tape wraps around the thickest part of the calf.
```

Las figuras se recortan por detección sobre el fondo `#181b22` y se normalizan a 512×512 (lo hago yo al implementar). Si en una figura se tocan las vecinas o sale texto, se pide regenerar solo esa con el método del punto 2.

## 3. Después de generarlas

- Guardar con el nombre de la tabla en `assets/medidas/` (el peso corporal no lleva imagen).
- Revisar anatomía y que ninguna tenga texto/números; si alguna los trae, pedir: `Regenerate without any text or numbers on the tape or anywhere.`
- Convertir a WebP 512×512 (~15-30 KB); eso lo hago yo al implementar.
