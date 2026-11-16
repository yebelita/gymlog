# 004 · APK Android (Capacitor) con alarma de descanso nativa
Estado: aprobada (2026-11-16); Fase 0 en curso
Depende de: 003 (la app que se empaqueta)

## Objetivo
Instalar GymLog en Android como **APK** para que el aviso de fin de descanso suene de forma fiable con la **pantalla bloqueada**, manteniendo la **PWA intacta** (mismo `index.html`) para el iPhone.

## Fuera de alcance
- Google Play Store, firma de producción para tienda, actualizaciones automáticas.
- App nativa de iOS (exigiría Mac y cuenta de Apple). En el iPhone una PWA **no puede programar notificaciones locales** (solo push con servidor): esa limitación se acepta.
- Sincronización entre dispositivos (Android e iPhone guardan datos por separado; se pasan con exportar/importar).
- Widgets, Wear OS, copia de seguridad en la nube.

## Hechos comprobados (2026-11-15)
- **Capacitor 8**: requiere Node ≥ 22 (hay 24.19), Android Studio ≥ 2025.2.1 (trae su propio JDK) y un SDK Platform ≥ API 24 (la última estable es API 36). En el equipo **no hay** Java, Android Studio, Android SDK ni `adb`.
- **`@capacitor/local-notifications` v8**: `schedule({ notifications: [{ id, title, body, channelId, schedule: { at, allowWhileIdle } , isExactNotification, isExactMandatory }] })`. Alarmas exactas: `USE_EXACT_ALARM` (Android 14, sin pantalla de permiso) o `SCHEDULE_EXACT_ALARM` (el usuario puede desactivarla). `POST_NOTIFICATIONS` es permiso en tiempo de ejecución desde Android 13. En Android 8+ la notificación debe tener un **canal** existente, y el sonido de un canal no se puede cambiar una vez creado. Con `allowWhileIdle` hay un límite de **una notificación cada 9 minutos por app en Doze** (a medir en el spike).
- Sin build: en el WebView de Capacitor los plugins se usan desde `window.Capacitor.Plugins.X`, sin importar módulos (a confirmar en el spike).

## Diseño

### 1. Estructura
- `package.json` gana como **devDependencies** `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/local-notifications`, `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/share` (versiones 8.x). La app sigue sin dependencias de runtime ni build.
- `capacitor.config.json`: `appId`, `appName: "GymLog"`, `webDir: "www"`.
- `scripts/sync-www.mjs` copia a `www/` solo lo que es la app (`index.html`, `manifest.json`, `icon-*.png`, `assets/`, `src/`) y **no** `sw.js`, `tests/`, `specs/`, `scripts/`, `node_modules/`. `www/` no se versiona. Después: `npx cap sync android`.
- La carpeta `android/` (proyecto Gradle generado) sí se versiona, salvo lo que Capacitor ya ignora.
- `docs/ANDROID.md`: pasos para instalar Android Studio, generar el APK y pasarlo al móvil.

### 2. Capa de plataforma en `index.html`
Nueva sección `/* ============ plataforma ============ */` con:
- `NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform())`.
- Una interfaz mínima para el descanso con **dos implementaciones**: la web de hoy (Notification + service worker + audio inaudible) y la nativa. El resto de la app no cambia.
  - `canNotify()`, `notifyOn()`, `askNotify()` (en nativo usan `LocalNotifications.checkPermissions/requestPermissions`).
  - `scheduleRest(endMs)` / `cancelRest()`.
- Web: se conserva el comportamiento actual byte a byte (los tests existentes de alarma de descanso deben pasar sin tocarlos).

### 3. Alarma de descanso nativa
- Al empezar o cambiar un descanso (`syncRest`), se programan **tres notificaciones con ids fijos**: la principal en `T.end` y dos de refuerzo en `T.end + 10 s` y `+ 20 s` (mismo patrón que el `RENOTIFY_AT` actual, que es lo único que hace vibrar el móvil bloqueado). Siempre se reprograma con los mismos ids, así que `+15`, `−15` y cambios del descanso no dejan alarmas viejas.
- **Cancelar** al saltar el descanso, terminar la sesión o desactivar notificaciones.
- **Sin duplicados con la app a la vista:** el sistema muestra la notificación aunque la app esté en primer plano. Por eso, 2 s antes del final, si la página **sigue visible** se cancelan las pendientes (la alarma en la app ya suena con `alarm()`); si la pantalla está bloqueada ese código no llega a ejecutarse y las notificaciones se quedan. Al volver a visible se cancelan las de refuerzo y se retiran las entregadas (equivale al `closeRestNote()` actual).
- **Canales de alarma, creados en código nativo** (`MainActivity.java`, porque el plugin no permite elegir el tipo de audio): el aviso usa `USAGE_ALARM`, que **suena aunque el móvil esté en vibración o silencio**, por el altavoz y por los auriculares conectados (volumen de *alarma*, que es independiente del de notificaciones y del de cada dispositivo). Se crean cuatro canales según los interruptores de Ajustes: `descanso-sv` (sonido y vibración), `descanso-s` (solo sonido), `descanso-v` (solo vibración) y `descanso-n` (ninguno, notificación silenciosa). Todos con importancia alta y visibilidad pública (se ve en pantalla de bloqueo), y la JS elige el canal al programar (`restChannel()`). El sonido de un canal no se puede cambiar una vez creado; para cambiarlo habría que usar otro id. Se borra el canal antiguo `descanso`.
- **Una sola alarma a la vez:** el WebView sigue ejecutando JavaScript con la pantalla bloqueada (comprobado en el móvil), así que la alarma web antigua (`startRing`) seguiría pitando a la vez que la notificación. En nativo, con la página **oculta** no suena la alarma de la app (lo hace la notificación); con la página **visible** suena la de la app y se cancelan las notificaciones pendientes.
- Alarma exacta con `isExactNotification: true` y `allowWhileIdle: true`.
- **No** se usa el audio inaudible (`keepAlive`) en nativo.
- Antes de programar se comprueba el permiso; si falta, no se programa y Ajustes lo explica.

### 4. Permisos y Android Manifest
`POST_NOTIFICATIONS`, `VIBRATE`, y la alarma exacta según la decisión 3. Ajustes (solo en nativo) muestra: estado de notificaciones, estado de alarmas exactas con botón para abrir su configuración, y un aviso sobre **ahorro de batería** del fabricante (cómo excluir la app) con enlace de ayuda.

### 5. Botón «Probar alarma»
Solo en nativo, en Ajustes. Un selector de tiempo **15 s · 1 min · 5 min · 30 min** (por defecto 15 s: 60 s resultaba largo para comprobar) y un botón que programa una notificación de prueba a ese tiempo, con el canal que corresponde a los interruptores de sonido y vibración. Los tiempos largos sirven para la prueba de ahorro de batería y de modo reposo (Doze). Sirve como **spike de la Fase 0** y se queda como herramienta permanente para que el usuario verifique su móvil.

### 6. Resto del comportamiento en nativo
- **Service worker:** no se registra (la app va empaquetada; las actualizaciones llegan con el APK).
- **Exportar/compartir respaldo:** en nativo se usa `Filesystem` + `Share` (el `<a download>` y `navigator.share` no sirven en el WebView).
- **Pantalla encendida:** se intenta con `navigator.wakeLock`; se comprueba en el spike y, si no funciona, se añade un plugin.
- **Botón atrás de Android:** se mantiene el comportamiento actual de la app (cerrar hoja, volver a Entrenar).
- **Versión:** `APP_VERSION` sigue mostrándose en Ajustes.

### 7. Fases
- **Fase 0 (spike, bloquea el resto):** instalar Android Studio, generar `android/`, construir un APK de depuración con el botón de prueba y verificar en el móvil que la notificación suena con la pantalla bloqueada. Medir también: 3 alarmas seguidas a 90 s con pantalla bloqueada (límite de 9 min en Doze) y con ahorro de batería activo.
- **Fase 1:** `sync-www`, `capacitor.config.json`, capa de plataforma y alarma nativa con tests.
- **Fase 2:** permisos y Ajustes, exportar/compartir, icono y nombre, `docs/ANDROID.md`.

## Criterios de aceptación
Los **CA** se prueban en jsdom con un `window.Capacitor` falso (plugins simulados). Los **M** son pruebas manuales en el móvil.

- **CA-1** Sin `window.Capacitor`, `NATIVE` es falso y toda la suite existente pasa **sin modificarla**.
- **CA-2** Con `Capacitor.isNativePlatform()` verdadero, `NATIVE` es verdadero y no se registra el service worker.
- **CA-3** En nativo, al empezar un descanso se programan 3 notificaciones con ids fijos, en el canal que corresponde a los interruptores (`restChannel()`), la principal en `T.end` y los refuerzos en `+10 s` y `+20 s`.
- **CA-4** `+15`/`−15` reprograman las mismas ids con la hora nueva; Saltar, terminar la sesión y desactivar notificaciones las cancelan.
- **CA-5** Con la página visible, 2 s antes del final se cancelan las pendientes; con la página oculta no se cancelan.
- **CA-6** Al volver a visible se cancelan los refuerzos pendientes y se retiran las notificaciones entregadas.
- **CA-7** Sin permiso de notificaciones no se programa nada; `askNotify` lo pide con el plugin y, si se concede, se programa el descanso en curso.
- **CA-8** Con `S.settings.notify` desactivado no se programa nada.
- **CA-9** Si la página estuvo congelada y vuelve más de 5 s tarde, no suena (igual que hoy).
- **CA-10** Ajustes muestra «Probar alarma» y un selector 15 s / 1 min / 5 min / 30 min (por defecto 15 s) solo en nativo; el botón programa una notificación exacta al tiempo elegido.
- **CA-10e** `restChannel()` devuelve `descanso-sv`, `-s`, `-v` o `-n` según los interruptores de sonido y vibración; la JS no crea canales (los crea el código nativo).
- **CA-10f** `MainActivity.java` crea los cuatro canales con `USAGE_ALARM`, importancia alta y visibilidad pública, y borra el canal antiguo `descanso`.
- **CA-15** En nativo, con la página oculta no suena la alarma de la app (solo la notificación); con la página visible suena la de la app y se cancelan las pendientes.
- **CA-11** Exportar y compartir en nativo usan `Filesystem` + `Share` y no `<a download>`.
- **CA-12** En web, `askNotify`, `notifyRest` y `closeRestNote` siguen funcionando como hoy.
- **CA-13** `scripts/sync-www.mjs` copia exactamente los archivos de la app a `www/` y no copia `sw.js`, `tests/`, `specs/`, `scripts/` ni `node_modules/`.
- **CA-14** `capacitor.config.json` y `AndroidManifest.xml` declaran el `appId`, `webDir` y los permisos acordados.
- **M-1** Con la pantalla bloqueada, la notificación suena y vibra a la hora del descanso (15 s, 1 min y 5 min). **Resultado: OK a 15 s, 1 min y 5 min.**
- **M-7** Con auriculares Bluetooth conectados y el móvil en modo **vibración**, la notificación suena (por los auriculares y el altavoz) y vibra. **Resultado: OK.**
- **M-2** Tres descansos seguidos de 90 s con pantalla bloqueada: suenan los tres.
- **M-3** Con la app a la vista, al acabar el descanso solo suena la alarma de la app (sin notificación duplicada). **Resultado: OK** (v11, descanso real).
- **M-4** Con ahorro de batería activado, sigue sonando (o se documenta cómo excluir la app).
- **M-5** Exportar respaldo desde la app y volver a importarlo en la misma app.
- **M-6** Tras 30 min con el móvil quieto y bloqueado (Doze), un descanso de 60 s suena. **Resultado: OK** (alarma de prueba a 30 min con el móvil desconectado del cable, a la hora esperada, sin ajustes de batería).

## Tareas
### Fase 0
- [x] Decidir `appId` y permiso de alarma exacta (ver «Decisiones»).
- [x] Instalar Android Studio y el SDK (hecho 2026-11-16: SDK con `platform-tools`, `build-tools 36.0.0` y plataforma `android-37.0`).
- [x] `npm i` de Capacitor, `capacitor.config.json`, `npx cap add android`, `sync-www` (hecho 2026-11-16).
- [x] Botón «Probar alarma (60 s)» y APK de depuración (`android/app/build/outputs/apk/debug/app-debug.apk`, 4,4 MB; app v9).
- [x] **Preparar el móvil** (hecho; solo hacía falta antes de instalar el APK; se puede hacer en paralelo a lo anterior): activar las opciones de desarrollador (tocar 7 veces el «Número de compilación»), activar la **depuración USB**, conectarlo por cable y aceptar «¿Permitir depuración USB?». Comprobar con `adb devices`.
- [x] Instalar el APK en el móvil con `adb install` (hecho: v9 y v10).
- [ ] En el móvil, ajustar la batería para la app (en MagicOS: inicio manual / permitir actividad en segundo plano) **después** de la primera prueba, para comparar con y sin ajuste (M-4).
- [ ] Probar M-1, M-2 y M-6 en el móvil; anotar resultados en esta spec.
### Fase 1
- [x] Tests (rojos primero): CA-1…CA-10f, CA-13, CA-14 de la Fase 0 y, de la Fase 1, CA-3…CA-9, CA-12 y CA-15 (más CA-5b y CA-8b, añadidos al implementar). Pendiente de la Fase 2: CA-11 (exportar/compartir nativo).
- [x] Capa de plataforma y alarma nativa integrada en `syncRest`/`tick`/`askNotify`/`closeRestNote` (app v11, 176 tests).
- [x] `scripts/sync-www.mjs`.
- [x] Probar en el móvil con el descanso real de una sesión (v11, 2026-11-16): pantalla encendida (una sola alarma), bloqueada (notificación del sistema y refuerzos a +10 s y +20 s), desbloquear (desaparece y no vuelve a sonar), vibración con auriculares Bluetooth (suena), +15 s (llega 15 s más tarde) y Saltar (no suena nada). **Todo OK.** M-2 (tres descansos seguidos) quedó cubierto de forma informal por varias pruebas encadenadas.
  - Observación: con los auriculares, esta vez el sonido salió solo por el altavoz del móvil; en la prueba de la v10 salió por ambos. No se pudo comprobar si los auriculares estaban activos (Android los mostraba solo emparejados). Cumple lo decidido («en el auricular o en el celular»); se vuelve a mirar si se repite con los auriculares activos.

**Notas de implementación (Fase 1):**
- Con el descanso ya sonado y los avisos activados, `syncRest` **no cancela** las alarmas: los refuerzos (+10 s, +20 s) se quedan hasta que el usuario atiende (al volver a visible se cancelan y se retiran las entregadas). Cancelar al sonar habría eliminado los refuerzos justo cuando hacen falta.
- Los avisos del navegador (`Notification`, service worker, audio inaudible) se desactivan en nativo (`notifyOn()` es falso).
- Se cancela por precaución en cada `syncRest` sin descanso (limpia alarmas viejas, p. ej. tras borrar datos); los tests cuentan solo las cancelaciones posteriores al inicio del descanso.
- Dos mutaciones confirmaron que los tests detectan fallos: quitar la cancelación a 2 s (rompe CA-5 y CA-5b) y dejar que la app suene con la pantalla bloqueada (rompe CA-6/CA-15).
### Fase 2
- [ ] Permisos, estado en Ajustes y ayuda de batería.
- [ ] Exportar/compartir nativo.
- [ ] Icono, nombre, `docs/ANDROID.md`; subir `CACHE`/`APP_VERSION`.

## Decisiones (2026-11-15)
1. **`appId`: `com.yebelita.gymlog`.** No es un dominio de pago: es solo un identificador único con formato de dominio invertido. **No se puede cambiar después** sin que Android lo trate como otra app.
2. **Móvil: Honor GFY-LX3, Android 14.** Honor usa MagicOS, que gestiona la batería de forma agresiva (suele matar procesos y alarmas en segundo plano si la app no está en modo de inicio manual/«permitir actividad en segundo plano»). Es el riesgo principal de esta spec y se verifica en el spike (M-1, M-2, M-4, M-6).
3. **Alarma exacta: `USE_EXACT_ALARM`** (recomendación aceptada por simplicidad). Con `SCHEDULE_EXACT_ALARM` en Android 14 el permiso viene desactivado por defecto y, si el usuario no lo concede o lo revoca, Android elimina las alarmas programadas sin avisar; habría que construir y probar la pantalla de estado y la gestión de la revocación. Si en el futuro la app se publicara en Google Play, se revisará.
4. **Android Studio:** instalación con `winget` (`Google.AndroidStudio`, 2026.2.2.8); si falla, la instala el usuario.
5. **El aviso suena siempre** (también en vibración o silencio), por altavoz y auriculares: canales con `USAGE_ALARM`. Decidido el 2026-11-16 a partir de la prueba en el móvil.
6. **Prueba:** selector de tiempo 15 s / 1 min / 5 min / 30 min.

## Notas de la Fase 0
- **JDK 21 obligatorio para compilar:** el proyecto que genera Capacitor 8 usa Gradle 8.14.3, que solo entiende hasta Java 24. El JDK 25 que trae Android Studio falla con `Unsupported class file major version 69`. Se instaló `Microsoft.OpenJDK.21` (`C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot`) y se compila con `JAVA_HOME` apuntando a él solo en ese comando (no se cambió el Java del sistema).
- **Compilar:** `node scripts/sync-www.mjs && npx cap sync android` y luego, en `android/`: `gradlew.bat assembleDebug` con `JAVA_HOME` (JDK 21) y `ANDROID_HOME` (`%LOCALAPPDATA%\Android\Sdk`). La primera compilación tardó ~13 min (descarga de Gradle y dependencias).
- **Plugins sin bundler:** la app usa `Capacitor.Plugins.LocalNotifications` (con `registerPlugin` como respaldo). Se confirma en el móvil con el botón de prueba.

## Resultados del spike en el móvil (Honor GFY-LX3, Android 14, MagicOS 8.0; 2026-11-16)
- **M-1 (pantalla bloqueada): OK.** La notificación llegó puntual a los 60 s, sonó, vibró y se mostró en la pantalla de bloqueo, sin tocar ajustes de batería. `Capacitor.Plugins.LocalNotifications` funciona sin bundler y `USE_EXACT_ALARM` no pidió ningún permiso.
- **Problema: con auriculares Bluetooth conectados solo vibra.** Causa (`dumpsys audio`): Android guarda un volumen **por dispositivo de salida** y por tipo de sonido; el volumen de *notificaciones* con Bluetooth (`bt_a2dp`) estaba en **0** (altavoz: 9; cableados: 14), mientras que el de *alarma* era 12 en Bluetooth y 15 en altavoz, y se reproduce por ambos. La web sí suena porque usa el volumen **multimedia** (9 en Bluetooth).
- El canal `descanso` creado por el plugin quedó con `USAGE_NOTIFICATION`, sonido predeterminado, importancia 4 y visibilidad en pantalla bloqueada «sin definir» (`-1000`): el plugin no deja fijar el uso de audio ni aplica bien la visibilidad.
- **Prueba con la v10 (canales `USAGE_ALARM` nativos), 2026-11-16: OK.**
  - Auriculares Bluetooth conectados y móvil en vibración: suena y vibra. **El sonido sale por los auriculares y por el altavoz a la vez**: es el comportamiento de Android para las alarmas (se oye aunque los auriculares no estén puestos). Si resultara molesto habría que replantear el tipo de audio (ver «Riesgos»).
  - Sin auriculares: suena.
  - Interruptor «Sonido» desactivado: vibra sin sonar (canal `descanso-v`).
  - Con eso quedan validados M-1 y M-7 con el botón de prueba.
- **Pruebas largas, 2026-11-16: OK.** Alarmas de 5 min y de 30 min (móvil quieto, bloqueado y sin cable) llegaron a la hora esperada **sin tocar los ajustes de batería de MagicOS**. Eso reduce mucho el riesgo principal de la spec (que el fabricante mate las alarmas) aunque no lo elimina: se repetirá con el descanso real y a lo largo de los días.
- **Decidido:** el aviso debe sonar **aunque el móvil esté en vibración**, por los auriculares o por el altavoz (decisión 5 más abajo). Con una sesión real, la alarma web antigua también sonó en modo vibración, con la pantalla encendida y bloqueada: es la alarma web (volumen multimedia, que Android no silencia en vibración) y el WebView sigue ejecutándola con la pantalla bloqueada.

## Riesgos
- **Sonido doble (auriculares y altavoz):** con `USAGE_ALARM` Android lo reproduce por ambas salidas. Es lo que permite oírlo sin los auriculares puestos, pero quien los lleva puestos lo oye también por el altavoz. Si molesta, la alternativa es otro tipo de audio (más difícil de controlar y sin la garantía de sonar en vibración).
- **Específicos del fabricante** (Xiaomi, Huawei, Samsung…): pueden matar alarmas aunque la app lo haga todo bien. Solo se descubre en el móvil real; de ahí el spike y el botón de prueba permanente.
- **Límite de 9 minutos en Doze** con `allowWhileIdle`: descansos seguidos con el móvil quieto podrían retrasarse. Se mide en M-2 y M-6; si falla, se evalúa un servicio en primer plano.
- **Plugins sin bundler:** si `Capacitor.Plugins` no se expone sin importar módulos, habrá que añadir un paso de empaquetado mínimo (rompería el «sin build»). Se confirma en el spike.
- **Firma del APK:** las actualizaciones por encima de una instalación exigen **la misma clave de firma**. Con la clave de depuración, vive en el equipo donde se compila; perderla obliga a desinstalar (y se pierden los datos si no se exportaron). Conviene generar una clave propia y guardarla con copia.
- **Datos:** el APK y la PWA de Chrome tienen `localStorage` separado. Para pasar los datos al APK: exportar en la PWA e importar en el APK.
- **Pantalla encendida** (`wakeLock`) en el WebView: a confirmar en el spike.
