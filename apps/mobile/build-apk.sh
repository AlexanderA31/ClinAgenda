#!/bin/sh
# Compila el APK de Android de Clínicas Paredes dentro de un contenedor (no hace falta instalar Android Studio).
#
#   sh apps/mobile/build-apk.sh                                   # usa la IP de este equipo: http://<ip>:3000
#   CLINAGENDA_URL=https://agenda.clinicasparedes.ec sh apps/mobile/build-apk.sh
#   PERMITIR_HTTP=false CLINAGENDA_URL=https://... sh apps/mobile/build-apk.sh   # para las tiendas: solo https
#
# Resultado: apps/mobile/dist/clinicas-paredes-<versión>.apk, firmado con la llave de este equipo.
# La llave (android/clinicas-paredes.jks y android/keystore.properties) se crea la primera vez y NO se sube al
# repositorio. Guárdela en un lugar seguro: sin ella no se pueden publicar actualizaciones de la app.
set -eu
cd "$(dirname "$0")"
MOVIL=$(pwd)
RAIZ=$(cd ../.. && pwd)
IMAGEN=${ANDROID_IMAGE:-ghcr.io/cirruslabs/android-sdk:36}
VERSION=${VERSION_NAME:-1.0.0}
CODIGO=${VERSION_CODE:-1}
HTTP=${PERMITIR_HTTP:-true}
MOTOR=$(command -v podman || command -v docker || true)
[ -n "$MOTOR" ] || { echo "Se necesita podman (o docker) para compilar el APK." >&2; exit 1; }

# Dirección con la que arranca la app. Sin CLINAGENDA_URL: la IP de este equipo en la red local.
URL=${CLINAGENDA_URL:-}
if [ -z "$URL" ]; then
  IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
  [ -n "$IP" ] && URL="http://$IP:3000"
fi
case "$URL" in http://*) [ "$HTTP" = true ] || { echo "PERMITIR_HTTP=false exige una dirección https://" >&2; exit 1; } ;; esac
echo "Dirección del sistema en la app: ${URL:-(la app la pedirá al abrir)}"

# 1. Copia la pantalla de inicio (www) y la configuración al proyecto de Android.
(cd "$RAIZ" && npx --workspace @clinagenda/mobile cap sync android)

# 2. Llave de firma: se crea una sola vez, con clave aleatoria, solo en este equipo.
if [ ! -f android/keystore.properties ]; then
  CLAVE=$(openssl rand -hex 24)
  "$MOTOR" run --rm --security-opt label=disable -v "$MOVIL/android:/firma" -w /firma "$IMAGEN" \
    keytool -genkeypair -keystore clinicas-paredes.jks -alias clinicas-paredes -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$CLAVE" -keypass "$CLAVE" -dname "CN=Clinicas Paredes, O=Clinicas Paredes, C=EC"
  printf 'storeFile=clinicas-paredes.jks\nstorePassword=%s\nkeyAlias=clinicas-paredes\nkeyPassword=%s\n' "$CLAVE" "$CLAVE" > android/keystore.properties
  chmod 600 android/keystore.properties android/clinicas-paredes.jks
  echo "Se creó la llave de firma en apps/mobile/android/ (no se sube al repositorio; respáldela)."
fi

# 3. Compila con Gradle dentro del contenedor del SDK. La caché de Gradle queda en un volumen para la próxima vez.
"$MOTOR" run --rm --security-opt label=disable \
  -v "$RAIZ:/repo" -v clinagenda-gradle:/root/.gradle -w /repo/apps/mobile/android "$IMAGEN" \
  ./gradlew --no-daemon -q assembleRelease -Pservidor="$URL" -PpermitirHttp="$HTTP" -PversionName="$VERSION" -PversionCode="$CODIGO"

mkdir -p dist
APK="dist/clinicas-paredes-$VERSION.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
echo "Listo: apps/mobile/$APK ($(du -h "$APK" | cut -f1))"
sha256sum "$APK" | cut -d' ' -f1 | sed 's/^/SHA-256: /'
