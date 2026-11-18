#!/bin/sh
# Respaldo automático de la base: un pg_dump comprimido cada BACKUP_INTERVAL_HOURS,
# conservando los últimos BACKUP_KEEP. Los archivos quedan en ./backups (fuera de Git).
# Para restaurar: ver INSTRUCCIONES.md, sección "Restaurar un respaldo".
set -eu
INTERVAL=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
KEEP=${BACKUP_KEEP:-14}
mkdir -p /backups
while true; do
  FILE="/backups/clinagenda-$(date +%Y%m%d-%H%M%S).sql.gz"
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$FILE.tmp"; then
    mv "$FILE.tmp" "$FILE"
    echo "Respaldo creado: $FILE"
  else
    rm -f "$FILE.tmp"
    echo "ERROR: no se pudo crear el respaldo" >&2
  fi
  ls -1t /backups/clinagenda-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
  sleep "$INTERVAL"
done
