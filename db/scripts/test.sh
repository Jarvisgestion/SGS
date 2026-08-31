#!/usr/bin/env bash
# Recrea el esquema, carga la semilla y corre las pruebas de reglas.
# Destructivo: apunta siempre a una base de desarrollo.
# Uso: DATABASE_URL=postgres://... db/scripts/test.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?falta DATABASE_URL}"

"$DIR/scripts/reset.sh" >/dev/null
for f in "$DIR"/seed/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA -f "$f" >/dev/null 2>&1
  echo "==> seed $(basename "$f")"
done
for f in "$DIR"/tests/*.sql; do
  echo "==> test $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qX -f "$f" 2>&1 | sed 's/^psql:[^ ]*: //; s/^NOTICE:  //'
done
