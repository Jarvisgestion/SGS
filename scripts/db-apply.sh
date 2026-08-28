#!/usr/bin/env bash
# Aplica las migraciones pendientes en orden y las registra en schema_migrations.
#
#   ./scripts/db-apply.sh                 # usa $DATABASE_URL o la conexión por defecto de psql
#   ./scripts/db-apply.sh --with-seed     # aplica además db/seed/
#   DATABASE_URL=postgres://... ./scripts/db-apply.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 --quiet --no-psqlrc)
[[ -n "${DATABASE_URL:-}" ]] && PSQL+=("$DATABASE_URL")

WITH_SEED=0
[[ "${1:-}" == "--with-seed" ]] && WITH_SEED=1

"${PSQL[@]}" -c "
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );" >/dev/null

apply_dir() {
  local dir="$1" track="$2"
  for file in "$dir"/*.sql; do
    [[ -e "$file" ]] || continue
    local name checksum applied
    name="$(basename "$file")"
    checksum="$(sha256sum "$file" | cut -d' ' -f1)"

    if [[ "$track" == "track" ]]; then
      applied="$("${PSQL[@]}" -tAc "SELECT checksum FROM schema_migrations WHERE filename = '$name'")"
      if [[ -n "$applied" ]]; then
        if [[ "$applied" != "$checksum" ]]; then
          echo "ERROR: $name ya fue aplicada pero su contenido cambió." >&2
          echo "       Las migraciones son inmutables: creá una nueva en vez de editarla." >&2
          exit 1
        fi
        echo "  = $name (ya aplicada)"
        continue
      fi
    fi

    echo "  + $name"
    "${PSQL[@]}" --single-transaction -f "$file" >/dev/null
    if [[ "$track" == "track" ]]; then
      "${PSQL[@]}" -c "INSERT INTO schema_migrations (filename, checksum) VALUES ('$name', '$checksum')" >/dev/null
    fi
  done
}

echo "Migraciones:"
apply_dir "$ROOT/db/migrations" track

if [[ "$WITH_SEED" == "1" ]]; then
  echo "Seed:"
  apply_dir "$ROOT/db/seed" no-track
fi

echo "Listo."
