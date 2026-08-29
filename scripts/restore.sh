#!/usr/bin/env bash
# Restaura un resguardo hecho con backup.sh.
#
#   ./scripts/restore.sh ./backups/20260829T120000Z sgs_restaurada /destino/adjuntos
#
# Crea la base indicada (si no existe) y vuelca ahí el dump; los adjuntos se
# extraen en la carpeta indicada. No pisa nada que ya tenga datos sin que se lo
# pidan: si la base existe y tiene tablas, aborta.
set -euo pipefail

ORIGEN="${1:?Falta la carpeta del resguardo}"
BASE="${2:?Falta el nombre de la base destino}"
ADJUNTOS="${3:-}"

[[ -f "$ORIGEN/base.dump" ]] || { echo "No hay base.dump en $ORIGEN" >&2; exit 1; }

echo "Verificando el resguardo…"
if [[ -f "$ORIGEN/manifiesto.txt" ]]; then
  esperado="$(grep '^base_sha256=' "$ORIGEN/manifiesto.txt" | cut -d= -f2)"
  actual="$(sha256sum "$ORIGEN/base.dump" | cut -d' ' -f1)"
  [[ "$esperado" == "$actual" ]] || { echo "El dump no coincide con su manifiesto" >&2; exit 1; }
fi

if psql -lqt | cut -d\| -f1 | grep -qw "$BASE"; then
  tablas="$(psql -tAd "$BASE" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")"
  [[ "$tablas" == "0" ]] || { echo "La base $BASE ya tiene $tablas tablas: no se pisa" >&2; exit 1; }
else
  createdb "$BASE"
fi

echo "Restaurando la base en $BASE…"
pg_restore --dbname="$BASE" --no-owner --no-privileges "$ORIGEN/base.dump"

if [[ -n "$ADJUNTOS" && -f "$ORIGEN/adjuntos.tar.gz" ]]; then
  echo "Restaurando los adjuntos en $ADJUNTOS…"
  mkdir -p "$ADJUNTOS"
  tar --extract --gzip --file="$ORIGEN/adjuntos.tar.gz" --directory="$ADJUNTOS"
fi

echo "Listo."
