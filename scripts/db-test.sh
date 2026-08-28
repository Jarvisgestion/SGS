#!/usr/bin/env bash
# Crea una base descartable, aplica migraciones + seed y corre las aserciones
# de db/test. Devuelve != 0 si alguna falla.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="${SGS_TEST_DB:-sgs_test_$$}"

cleanup() { dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

dropdb --if-exists "$DB"
createdb "$DB"
export PGDATABASE="$DB"
unset DATABASE_URL

"$ROOT/scripts/db-apply.sh" --with-seed

echo "Tests:"
for file in "$ROOT"/db/test/*.sql; do
  [[ -e "$file" ]] || continue
  echo "  > $(basename "$file")"
  psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc -f "$file"
done
echo "OK"
