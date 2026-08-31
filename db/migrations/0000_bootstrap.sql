-- 0000_bootstrap.sql
-- Infraestructura común: control de migraciones y helpers reutilizables.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE schema_migrations IS
  'Migraciones aplicadas. La aplica db/scripts/migrate.sh, no editar a mano.';

-- Mantiene updated_at sin depender de la aplicación.
CREATE OR REPLACE FUNCTION sgs_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Usuario actor de la sesión, seteado por la aplicación con
--   SET LOCAL sgs.current_user_id = '<uuid>';
-- Se usa para el audit_log y (opcionalmente) para RLS.
CREATE OR REPLACE FUNCTION sgs_current_user_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('sgs.current_user_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION sgs_current_company_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('sgs.current_company_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;
