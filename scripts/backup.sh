#!/usr/bin/env bash
# Copia de resguardo: la base y los adjuntos, que son las dos mitades del mismo
# registro. Un registro aprobado sin su foto está incompleto ante una
# inspección, así que se respaldan juntos y se restauran juntos.
#
#   ./scripts/backup.sh                       # a ./backups/<fecha>
#   ./scripts/backup.sh /destino/backups      # a otra carpeta
#
# Variables: DATABASE_URL (o las PG* habituales) y SGS_STORAGE_DIR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESTINO="${1:-$ROOT/backups}"
ADJUNTOS="${SGS_STORAGE_DIR:-$ROOT/var/attachments}"
SELLO="$(date -u +%Y%m%dT%H%M%SZ)"
CARPETA="$DESTINO/$SELLO"

mkdir -p "$CARPETA"

echo "Base de datos…"
# Formato custom: permite restaurar en paralelo y elegir qué traer.
pg_dump --format=custom --no-owner --no-privileges \
  ${DATABASE_URL:+--dbname="$DATABASE_URL"} \
  --file="$CARPETA/base.dump"

echo "Adjuntos…"
if [[ -d "$ADJUNTOS" ]]; then
  tar --create --gzip --file="$CARPETA/adjuntos.tar.gz" --directory="$ADJUNTOS" .
else
  echo "  (no hay carpeta de adjuntos en $ADJUNTOS)"
  tar --create --gzip --file="$CARPETA/adjuntos.tar.gz" --files-from=/dev/null
fi

# Un resguardo que no se puede verificar no sirve: se deja constancia de qué
# hay adentro para poder comprobarlo sin restaurar.
{
  echo "fecha_utc=$SELLO"
  echo "base_bytes=$(stat -c%s "$CARPETA/base.dump")"
  echo "adjuntos_bytes=$(stat -c%s "$CARPETA/adjuntos.tar.gz")"
  echo "adjuntos_archivos=$(tar --list --file="$CARPETA/adjuntos.tar.gz" | grep -vc '/$' || true)"
  echo "base_sha256=$(sha256sum "$CARPETA/base.dump" | cut -d' ' -f1)"
  echo "adjuntos_sha256=$(sha256sum "$CARPETA/adjuntos.tar.gz" | cut -d' ' -f1)"
} > "$CARPETA/manifiesto.txt"

echo "Listo: $CARPETA"
cat "$CARPETA/manifiesto.txt"
