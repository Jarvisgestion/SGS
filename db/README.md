# Base de datos — Plataforma SGS

Traducción ejecutable del modelo conceptual de `docs/02-modelo-de-datos.md` a
PostgreSQL 16. El detalle de por qué cada decisión está en
`docs/03-esquema-sql.md`; acá va lo operativo.

## Uso

```bash
createdb sgs_dev
export PGDATABASE=sgs_dev          # o DATABASE_URL=postgres://...

./scripts/db-apply.sh              # aplica migraciones pendientes
./scripts/db-apply.sh --with-seed  # + catálogo base de roles y demo Chiarmar
./scripts/db-test.sh               # base descartable + migraciones + aserciones
```

## Estructura

```
db/
  migrations/   inmutables, se aplican en orden y se registran en schema_migrations
  seed/         idempotentes, se pueden re-correr (no se registran)
  test/         aserciones SQL; fallan con "ASSERT FALLÓ: ..." y cortan la corrida
```

## Reglas

- **Las migraciones no se editan una vez aplicadas.** `db-apply.sh` guarda el
  sha256 de cada archivo y aborta si cambia; para corregir algo se agrega una
  migración nueva.
- **El seed de Chiarmar es demo.** `900_demo_chiarmar.sql` existe para probar que
  el esquema aguanta los formularios difíciles del relevamiento. No es el
  catálogo de ninguna empresa cliente: Xeitosiño y Pesantar cargan el suyo.
- **`001_platform_roles.sql` sí es catálogo real** de la plataforma (roles base
  sobre los que cada empresa agrega los propios).
- **El backend debe setear el actor en cada transacción** para que la bitácora
  registre quién hizo cada cosa:

  ```sql
  SET LOCAL sgs.actor_user_id = '<uuid del usuario>';
  ```

  Sin eso el `audit_log` cae al `created_by` / `reviewer_id` de la fila cuando
  puede, y queda en NULL cuando no.
