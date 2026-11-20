#!/bin/sh
# Compila el APK de Android de Clínicas Paredes (Flutter) dentro de un contenedor: no hace falta instalar
# Flutter ni Android Studio.
#
#   sh apps/flutter/build-apk.sh                                     # con la IP de este equipo: http://<ip>:3000
#   SERVIDOR=https://agenda.clinicasparedes.ec sh apps/flutter/build-apk.sh
#   PERMITIR_HTTP=false SERVIDOR=https://... sh apps/flutter/build-apk.sh    # para las tiendas: solo https
#
# Resultado: apps/flutter/dist/clinicas-paredes-<versión>.apk, firmado con la llave de este equipo
# (android/clinicas-paredes.jks y android/keystore.properties: NO se suben al repositorio; respáldelas).
set -eu
cd "$(dirname "$0")"
HTTP=${PERMITIR_HTTP:-true}
URL=${SERVIDOR:-}
if [ -z "$URL" ]; then
  IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')
  [ -n "$IP" ] && URL="http://$IP:3000"
fi
case "$URL" in http://*) [ "$HTTP" = true ] || { echo "PERMITIR_HTTP=false exige una dirección https://" >&2; exit 1; } ;; esac
echo "Dirección del sistema en la app: ${URL:-(la app la pedirá al abrir)}"

# Llave de firma: se crea una sola vez, con clave aleatoria, solo en este equipo.
if [ ! -f android/keystore.properties ]; then
  CLAVE=$(openssl rand -hex 24)
  podman run --rm --security-opt label=disable -v "$(pwd)/android:/firma" -w /firma "${FLUTTER_IMAGE:-ghcr.io/cirruslabs/flutter:3.41.9}" \
    keytool -genkeypair -keystore clinicas-paredes.jks -alias clinicas-paredes -keyalg RSA -keysize 4096 -validity 10000 \
    -storepass "$CLAVE" -keypass "$CLAVE" -dname "CN=Clinicas Paredes, O=Clinicas Paredes, C=EC"
  printf 'storeFile=clinicas-paredes.jks\nstorePassword=%s\nkeyAlias=clinicas-paredes\nkeyPassword=%s\n' "$CLAVE" "$CLAVE" > android/keystore.properties
  chmod 600 android/keystore.properties android/clinicas-paredes.jks
  echo "Se creó la llave de firma en apps/flutter/android/ (no se sube al repositorio; respáldela)."
fi

VERSION=$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' pubspec.yaml)
PERMITIR_HTTP="$HTTP" sh ./flutter.sh build apk --release --dart-define=SERVIDOR="$URL"
mkdir -p dist
APK="dist/clinicas-paredes-$VERSION.apk"
cp build/app/outputs/flutter-apk/app-release.apk "$APK"
echo "Listo: apps/flutter/$APK ($(du -h "$APK" | cut -f1))"
sha256sum "$APK" | cut -d' ' -f1 | sed 's/^/SHA-256: /'
