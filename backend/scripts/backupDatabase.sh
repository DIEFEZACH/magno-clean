#!/bin/sh
set -eu

umask 077

: "${DATABASE_URL:?DATABASE_URL debe estar configurada en el entorno}"
: "${BACKUP_DIRECTORY:?BACKUP_DIRECTORY debe ser una ruta explícita}"

retention_days="${BACKUP_RETENTION_DAYS:-30}"
case "$retention_days" in
  ''|*[!0-9]*) echo "BACKUP_RETENTION_DAYS debe ser un entero positivo" >&2; exit 1 ;;
esac
if [ "$retention_days" -lt 1 ]; then
  echo "BACKUP_RETENTION_DAYS debe ser mayor que cero" >&2
  exit 1
fi

command -v pg_dump >/dev/null 2>&1 || {
  echo "pg_dump no está instalado" >&2
  exit 1
}

mkdir -p "$BACKUP_DIRECTORY"
backup_file="$BACKUP_DIRECTORY/magno-clean-$(date -u +%Y%m%dT%H%M%SZ).dump"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "$backup_file.sha256"
else
  shasum -a 256 "$backup_file" > "$backup_file.sha256"
fi

find "$BACKUP_DIRECTORY" -type f \
  \( -name 'magno-clean-*.dump' -o -name 'magno-clean-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

echo "Backup lógico creado y checksum generado. Transfiérelo a almacenamiento off-site cifrado."
