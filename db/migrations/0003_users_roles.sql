-- 0003_users_roles.sql
-- Personas, roles y asignaciones con vigencia (soporta RMGS-02, cambio de mando).

-- ---------------------------------------------------------------------------
-- roles
--
-- Catálogo, no enum: cada empresa puede agregar los suyos (company_id NOT NULL)
-- sobre el catálogo base de la plataforma (company_id NULL).
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
  code                 text PRIMARY KEY,
  company_id           uuid REFERENCES companies (id) ON DELETE CASCADE,
  name                 text NOT NULL,
  is_shipboard         boolean NOT NULL DEFAULT false, -- rol embarcado: exige vessel_id
  exclusive_per_vessel boolean NOT NULL DEFAULT false, -- un solo titular vigente por buque
  description          text,
  CONSTRAINT roles_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$')
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid REFERENCES companies (id) ON DELETE RESTRICT, -- NULL = asesor externo multi-empresa
  default_vessel_id uuid,
  full_name         text NOT NULL,
  dni               text,
  email             citext,
  password_hash     text,
  pin_hash          text,                 -- confirmación por PIN en checklists
  signature_file_id uuid,                 -- FK a attachments, se agrega en 0006
  status            entity_status NOT NULL DEFAULT 'activo',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT users_id_company_key UNIQUE (id, company_id),
  -- MATCH SIMPLE: si company_id es NULL (asesor externo) la FK no aplica
  FOREIGN KEY (default_vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE SET NULL (default_vessel_id)
);
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_company_dni_key ON users (company_id, dni) WHERE dni IS NOT NULL;
CREATE INDEX users_company_idx ON users (company_id);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- ---------------------------------------------------------------------------
-- user_roles
--
-- El rol es una tabla aparte y con vigencia porque una misma persona puede ser
-- Capitán de un buque en una marea y pasar a otro, y porque el asesor externo
-- opera sobre varias compañías a la vez.
-- ---------------------------------------------------------------------------
CREATE TABLE user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_code  text NOT NULL REFERENCES roles (code) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  vessel_id  uuid,
  valid_from date NOT NULL DEFAULT current_date,
  valid_to   date,                        -- NULL = vigente
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT user_roles_period_valid CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX user_roles_current_key
  ON user_roles (user_id, role_code, company_id, coalesce(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE valid_to IS NULL;
CREATE INDEX user_roles_company_role_idx ON user_roles (company_id, role_code) WHERE valid_to IS NULL;
CREATE INDEX user_roles_vessel_idx ON user_roles (vessel_id) WHERE valid_to IS NULL;

-- Reglas de coherencia rol/asignación:
--  * un rol embarcado exige buque;
--  * un rol exclusivo por buque (Capitán, Jefe de Máquinas) no admite dos
--    titulares vigentes sobre el mismo buque — es lo que hace que el cambio de
--    mando (RMGS-02) tenga que cerrar el rol saliente antes de abrir el entrante;
--  * un rol propio de otra empresa no se puede asignar.
CREATE OR REPLACE FUNCTION sgs_check_user_role() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM roles WHERE code = NEW.role_code;

  IF r.company_id IS NOT NULL AND r.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'El rol % pertenece a otra empresa', NEW.role_code
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF r.is_shipboard AND NEW.vessel_id IS NULL THEN
    RAISE EXCEPTION 'El rol embarcado % requiere vessel_id', NEW.role_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF r.exclusive_per_vessel AND NEW.valid_to IS NULL AND NEW.vessel_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.role_code = NEW.role_code
        AND ur.vessel_id = NEW.vessel_id
        AND ur.valid_to IS NULL
        AND ur.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Ya hay un % vigente en ese buque: cerrá el rol saliente (RMGS-02) antes de asignar el entrante', NEW.role_code
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER user_roles_check BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION sgs_check_user_role();

-- Helper usado por las políticas de permisos de record_types.
CREATE OR REPLACE FUNCTION sgs_user_role_codes(p_user_id uuid, p_vessel_id uuid DEFAULT NULL, p_on date DEFAULT current_date)
RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT ur.role_code), '{}')
  FROM user_roles ur
  WHERE ur.user_id = p_user_id
    AND ur.valid_from <= p_on
    AND (ur.valid_to IS NULL OR ur.valid_to >= p_on)
    AND (ur.vessel_id IS NULL OR p_vessel_id IS NULL OR ur.vessel_id = p_vessel_id);
$$;
