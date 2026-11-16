# GymLog en Android (APK con Capacitor)

La misma app (`index.html`) se empaqueta como APK con [Capacitor](https://capacitorjs.com/) para que el aviso de fin de descanso lo haga el sistema Android (alarmas programadas), aunque la pantalla esté bloqueada. La PWA no cambia y sigue siendo la opción para el iPhone.

> Los datos del APK y los de la PWA del navegador son **independientes**: para pasarlos, exporta el respaldo en uno e impórtalo en el otro.

## Requisitos

- **Node 22 o superior** y `npm install` (instala Capacitor como dependencia de desarrollo).
- **Android Studio** (2025.2.1 o superior) con un SDK de Android instalado (API 36). Se instala con el asistente de primer arranque.
- **JDK 21.** El proyecto usa Gradle 8.14, que **no** admite el JDK 25 que trae Android Studio (falla con `Unsupported class file major version 69`). Instálalo, por ejemplo, con `winget install Microsoft.OpenJDK.21`, y úsalo solo al compilar (sin cambiar el Java del sistema).
- Si abres `android/` en Android Studio o en VS Code, elige **JDK 21 como Gradle JVM** (no «Upgrade Gradle»).

## Compilar

Desde la raíz del proyecto:

```powershell
node scripts/sync-www.mjs        # copia a www/ solo los archivos de la app (los de ASSETS de sw.js)
npx cap sync android             # los lleva al proyecto Android

$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.13.21-hotspot"   # ajusta la versión instalada
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd android
.\gradlew.bat assembleDebug --no-daemon      # APK de depuración  → app/build/outputs/apk/debug/app-debug.apk
.\gradlew.bat assembleRelease --no-daemon    # APK firmado         → app/build/outputs/apk/release/app-release.apk
```

La primera compilación tarda unos 13 minutos (descarga Gradle y las dependencias); las siguientes, menos de un minuto.

## Instalar en el móvil

1. En el móvil: Ajustes → Acerca del teléfono → toca 7 veces **Número de compilación**; después, Ajustes → Sistema → Opciones de desarrollador → **Depuración USB**.
2. Conéctalo por cable (modo «Transferencia de archivos») y acepta «¿Permitir depuración USB?».
3. Comprueba que lo ve: `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe devices`.
4. `adb install -r android\app\build\outputs\apk\release\app-release.apk`

También puedes copiar el APK al móvil y abrirlo (Android pedirá permitir «instalar apps desconocidas»).

## Firma del APK y copia de la clave (importante)

Android solo deja **actualizar** una app instalada si el APK nuevo está firmado con la **misma clave**. Si cambias de clave hay que desinstalar la app, y **se pierden los datos locales** (sesiones, medidas…) si no exportaste un respaldo antes.

La clave de firma vive **fuera del repositorio**:

- `%USERPROFILE%\.gymlog\gymlog-release.jks` — el almacén de claves.
- `android/keystore.properties` — ruta, alias y contraseñas (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Está en `.gitignore`.

**Haz una copia de ambos archivos** en un sitio seguro y distinto del PC (gestor de contraseñas, nube privada, memoria externa). Sin ellos no podrás actualizar la app: tendrás que desinstalarla, con la pérdida de datos que eso supone. Para crear una clave nueva:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -keystore "$env:USERPROFILE\.gymlog\gymlog-release.jks" `
  -alias gymlog -keyalg RSA -keysize 2048 -validity 10000
```

Sin `keystore.properties`, `assembleDebug` funciona igual (usa la clave de depuración de Android) y `assembleRelease` sale **sin firmar** y no se puede instalar.

## Si la alarma no suena con la pantalla bloqueada

Algunos fabricantes (Honor, Xiaomi, Huawei…) cierran las apps en segundo plano para ahorrar batería. En el móvil: Ajustes → **Batería** → **Inicio de aplicaciones** (o «Optimización de batería») → GymLog → permitir la actividad en segundo plano o ponerla sin restricciones. En el Honor GFY-LX3 (Android 14, MagicOS 8) de las pruebas **no hizo falta**: las alarmas de 15 s, 1, 5 y 30 minutos llegaron a la hora sin tocar ningún ajuste.

Para comprobarlo en tu móvil: Ajustes de GymLog → **Probar alarma** (15 s · 1 min · 5 min · 30 min), bloquea la pantalla y espera.

## Cómo suena el aviso

Los avisos usan canales de **alarma** (`USAGE_ALARM`) creados en `android/app/src/main/java/com/yebelita/gymlog/MainActivity.java`: suenan aunque el móvil esté en modo vibración, por el altavoz y por los auriculares conectados, y se ven en la pantalla de bloqueo. Hay un canal por cada combinación de los interruptores «Sonido» y «Vibración» de Ajustes. El sonido de un canal no se puede cambiar después de creado: para cambiarlo hay que usar otro id de canal.
