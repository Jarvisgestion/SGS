#!/usr/bin/env bash
# Aplica las migraciones pendientes en orden, cada una en su propia transacción.
# Uso: DATABASE_URL=postgres://... db/scripts/migrate.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql "${DATABASE_URL:?falta DATABASE_URL}" -v ON_ERROR_STOP=1 -qtA)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());" >/dev/null

applied=0
for file in "$DIR"/migrations/*.sql; do
  version="$(basename "$file" .sql)"
  if [ -n "$("${PSQL[@]}" -c "SELECT 1 FROM schema_migrations WHERE version = '$version';")" ]; then
    continue
  fi
  echo "==> aplicando $version"
  "${PSQL[@]}" -1 -f "$file" \
    -c "INSERT INTO schema_migrations (version) VALUES ('$version');" >/dev/null
  applied=$((applied + 1))
done

if [ "$applied" -eq 0 ]; then
  echo "sin migraciones pendientes"
else
  echo "$applied migración(es) aplicada(s)"
fi
