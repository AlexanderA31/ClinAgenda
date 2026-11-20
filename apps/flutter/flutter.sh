#!/bin/sh
# Corre Flutter dentro de un contenedor (no hace falta instalarlo):  sh apps/flutter/flutter.sh analyze
# Las descargas de paquetes y de Gradle quedan en volúmenes, para que la siguiente vez sea rápido.
set -eu
cd "$(dirname "$0")"
MOTOR=$(command -v podman || command -v docker)
exec "$MOTOR" run --rm --security-opt label=disable --network host -e PERMITIR_HTTP \
  -v "$(pwd):/app" -v clinagenda-pub:/root/.pub-cache -v clinagenda-gradle:/root/.gradle -w /app \
  "${FLUTTER_IMAGE:-ghcr.io/cirruslabs/flutter:3.41.9}" flutter --suppress-analytics "$@"
