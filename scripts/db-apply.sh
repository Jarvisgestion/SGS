#!/usr/bin/env bash
# Aplica las migraciones pendientes.
#
#   ./scripts/db-apply.sh                 # sólo migraciones
#   ./scripts/db-apply.sh --with-seed     # además el seed
#   DATABASE_URL=postgres://... ./scripts/db-apply.sh
#
# Es un envoltorio de `api/src/cli/migrate.ts`, que es donde está la lógica:
# así el despliegue (que corre en Node, sin psql) y el desarrollo usan lo mismo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT/api/node_modules" ]]; then
  echo "Faltan las dependencias de la API. Corré: cd api && npm install" >&2
  exit 1
fi

ARGS=()
[[ "${1:-}" == "--with-seed" ]] && ARGS+=(--seed)

cd "$ROOT/api"
exec node --experimental-strip-types src/cli/migrate.ts "${ARGS[@]}"
