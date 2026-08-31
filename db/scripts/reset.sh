#!/usr/bin/env bash
# Recrea el esquema desde cero. Destructivo: solo para desarrollo.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
psql "${DATABASE_URL:?falta DATABASE_URL}" -v ON_ERROR_STOP=1 -qtA \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
echo "esquema public recreado"
"$DIR/scripts/migrate.sh"
