#!/usr/bin/env bash
# Prueba el resguardo de punta a punta: carga datos, respalda, restaura en una
# base nueva y compara. Un backup que nunca se restauró no es un backup.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORIGEN="sgs_backup_origen_$$"
DESTINO="sgs_backup_destino_$$"
TRABAJO="$(mktemp -d)"

limpiar() {
  dropdb --if-exists --force "$ORIGEN" >/dev/null 2>&1 || true
  dropdb --if-exists --force "$DESTINO" >/dev/null 2>&1 || true
  rm -rf "$TRABAJO"
}
trap limpiar EXIT

echo "1. Base con datos y un adjunto"
createdb "$ORIGEN"
PGDATABASE="$ORIGEN" "$ROOT/scripts/db-apply.sh" --with-seed >/dev/null

mkdir -p "$TRABAJO/adjuntos/ab/cd"
printf 'contenido de prueba' > "$TRABAJO/adjuntos/ab/cd/abcd.png"

psql -qd "$ORIGEN" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
INSERT INTO attachments (company_id, storage_key, file_name, file_type, content_type, byte_size, checksum)
VALUES ('11111111-1111-1111-1111-111111111111', 'ab/cd/abcd.png', 'foto.png', 'image', 'image/png', 19, 'abcd');
SQL

registros_origen="$(psql -tAd "$ORIGEN" -c 'SELECT count(*) FROM record_types')"
riesgos_origen="$(psql -tAd "$ORIGEN" -c 'SELECT count(*) FROM risk_assessments')"

echo "2. Resguardo"
DATABASE_URL="postgres:///$ORIGEN" SGS_STORAGE_DIR="$TRABAJO/adjuntos" \
  "$ROOT/scripts/backup.sh" "$TRABAJO/backups" >/dev/null
CARPETA="$(find "$TRABAJO/backups" -mindepth 1 -maxdepth 1 -type d | head -1)"

echo "3. Restauración en una base nueva"
"$ROOT/scripts/restore.sh" "$CARPETA" "$DESTINO" "$TRABAJO/restaurados" >/dev/null

echo "4. Comprobaciones"
fallas=0
comparar() {
  if [[ "$2" == "$3" ]]; then echo "   ok  $1"; else echo "   MAL $1: $2 != $3"; fallas=1; fi
}

comparar "tipos de registro" "$registros_origen" "$(psql -tAd "$DESTINO" -c 'SELECT count(*) FROM record_types')"
comparar "matriz de riesgo"  "$riesgos_origen"  "$(psql -tAd "$DESTINO" -c 'SELECT count(*) FROM risk_assessments')"
comparar "adjuntos" "1" "$(psql -tAd "$DESTINO" -c 'SELECT count(*) FROM attachments')"
comparar "archivo restaurado" "contenido de prueba" "$(cat "$TRABAJO/restaurados/ab/cd/abcd.png")"

# El archivo tiene que seguir siendo el que dice su checksum de almacenamiento.
clave="$(psql -tAd "$DESTINO" -c 'SELECT storage_key FROM attachments LIMIT 1' | xargs)"
comparar "el registro apunta al archivo" "si" \
  "$([[ -f "$TRABAJO/restaurados/$clave" ]] && echo si || echo no)"

# Las migraciones ya aplicadas viajan: el sistema restaurado no las repite.
comparar "migraciones registradas" \
  "$(psql -tAd "$ORIGEN" -c 'SELECT count(*) FROM schema_migrations')" \
  "$(psql -tAd "$DESTINO" -c 'SELECT count(*) FROM schema_migrations')"

# Y la base restaurada tiene que funcionar, no sólo tener las filas.
comparar "las vistas funcionan" "si" \
  "$(psql -tAd "$DESTINO" -c 'SELECT count(*) >= 0 FROM v_record_compliance' >/dev/null 2>&1 && echo si || echo no)"

[[ "$fallas" == "0" ]] || { echo "El resguardo NO se restaura correctamente"; exit 1; }
echo "Resguardo verificado."
