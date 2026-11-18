#!/bin/sh
# Al arrancar: aplica migraciones pendientes, carga datos de demostración si la base está vacía
# (desactivable con SEED_ON_START=false) y levanta la API.
set -e
npx prisma migrate deploy
if [ "${SEED_ON_START:-true}" = "true" ]; then
  npx tsx prisma/seed.ts
fi
exec node dist/main.js
