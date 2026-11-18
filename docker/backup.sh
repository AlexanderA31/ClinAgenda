#!/bin/sh
# Respaldo automático de la base.
#  - Cada BACKUP_INTERVAL_HOURS: pg_dump comprimido en /backups (carpeta ./backups del servidor).
#  - Verifica que el archivo no esté dañado (gzip -t) antes de darlo por bueno.
#  - Copia el respaldo a /backups-copy: una carpeta FUERA del servidor (disco externo, o una carpeta
#    sincronizada con Google Drive/OneDrive). Así, si el servidor se daña, los respaldos no se pierden con él.
#  - Escribe /backups/estado.json, que la API lee para avisar a la dirección si algo falla.
set -u
INTERVAL=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
KEEP=${BACKUP_KEEP:-14}
mkdir -p /backups

rotate() { ls -1t "$1"/clinagenda-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f; }

while true; do
  NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  NAME="clinagenda-$(date +%Y%m%d-%H%M%S).sql.gz"
  OK=false; COPY=false; SIZE=0; ERROR=""
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "/backups/$NAME.tmp" && gzip -t "/backups/$NAME.tmp"; then
    mv "/backups/$NAME.tmp" "/backups/$NAME"
    SIZE=$(wc -c < "/backups/$NAME")
    OK=true
    rotate /backups
    if [ -d /backups-copy ] && [ -w /backups-copy ] && [ "${BACKUP_COPY_ENABLED:-true}" = "true" ]; then
      if cp "/backups/$NAME" "/backups-copy/$NAME"; then COPY=true; rotate /backups-copy; else ERROR="No se pudo copiar a la carpeta externa"; fi
    else
      ERROR="La carpeta externa de respaldos no está disponible"
    fi
    echo "Respaldo creado: $NAME ($SIZE bytes) · copia externa: $COPY"
  else
    rm -f "/backups/$NAME.tmp"
    ERROR="Falló pg_dump o el archivo quedó dañado"
    echo "ERROR: $ERROR" >&2
  fi
  printf '{"at":"%s","file":"%s","bytes":%s,"ok":%s,"copied":%s,"error":"%s","intervalHours":%s}\n' \
    "$NOW" "$NAME" "$SIZE" "$OK" "$COPY" "$ERROR" "${BACKUP_INTERVAL_HOURS:-24}" > /backups/estado.json.tmp && mv /backups/estado.json.tmp /backups/estado.json
  sleep "$INTERVAL"
done
