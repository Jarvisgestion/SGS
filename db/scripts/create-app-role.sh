#!/usr/bin/env bash
# Crea el rol de conexión de la aplicación.
#
# La app NO debe conectarse con el dueño de las tablas: el dueño saltea Row Level
# Security y el aislamiento entre empresas dejaría de existir. sgs_web hereda los
# permisos de sgs_app (creado por la migración 0007) sin ser dueño de nada.
#
# Uso: DATABASE_URL=<url del dueño> APP_PASSWORD=... db/scripts/create-app-role.sh
set -euo pipefail
: "${DATABASE_URL:?falta DATABASE_URL}"
ROLE="${APP_ROLE:-sgs_web}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA <<PSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$ROLE') THEN
    CREATE ROLE $ROLE LOGIN IN ROLE sgs_app;
  END IF;
END \$\$;
PSQL

if [ -n "${APP_PASSWORD:-}" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtA \
    -c "ALTER ROLE $ROLE PASSWORD '$APP_PASSWORD';" >/dev/null
fi
echo "rol $ROLE listo (miembro de sgs_app, sin propiedad sobre las tablas)"
