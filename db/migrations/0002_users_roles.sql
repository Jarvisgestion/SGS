-- 0002_users_roles.sql
-- Usuarios, catálogo de roles y asignaciones con vigencia (soporta RMGS-02, cambio de mando).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- company_id NULL = rol estándar de plataforma, disponible para todas las empresas.
CREATE TABLE roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid REFERENCES companies(id) ON DELETE CASCADE,
  code        text NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name        text NOT NULL,
  scope       text NOT NULL CHECK (scope IN ('embarcado','tierra','plataforma')),
  description text,
  status      text NOT NULL DEFAULT 'activo' CHECK (status IN ('activo','inactivo')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX roles_global_code_key  ON roles (code) WHERE company_id IS NULL;
CREATE UNIQUE INDEX roles_company_code_key ON roles (company_id, code) WHERE company_id IS NOT NULL;

COMMENT ON TABLE roles IS
  'Roles del SGS. Los globales (company_id NULL) son el estándar de la plataforma; '
  'cada empresa puede sumar los propios sin cambio de esquema.';

INSERT INTO roles (company_id, code, name, scope, description) VALUES
  (NULL, 'apoderado',            'Apoderado / Armador',              'tierra',     'Firma políticas y nombramiento de PD (RMGS-01, RMGS-07)'),
  (NULL, 'persona_designada',    'Persona Designada (PD)',           'tierra',     'Nexo buque-empresa-PNA; revisa y aprueba registros'),
  (NULL, 'armamento',            'Armamento',                        'tierra',     'Área de armamento / aprovisionamiento'),
  (NULL, 'tecnica',              'Técnica',                          'tierra',     'Área técnica / mantenimiento'),
  (NULL, 'responsable_sh',       'Responsable de Seguridad e Higiene','tierra',     'Matriz de riesgo (PO-08)'),
  (NULL, 'auditor_interno',      'Auditor interno',                  'tierra',     'Auditorías PA-06'),
  (NULL, 'personal_tierra',      'Personal de tierra',               'tierra',     'Alcanzado por RO-03C'),
  (NULL, 'capitan',              'Capitán',                          'embarcado',  'Máxima autoridad a bordo'),
  (NULL, 'jefe_maquinas',        'Jefe de Máquinas',                 'embarcado',  NULL),
  (NULL, 'oficial_puente',       'Oficial de Puente',                'embarcado',  NULL),
  (NULL, 'oficial_maquinas',     'Oficial de Máquinas',              'embarcado',  NULL),
  (NULL, 'tripulante',           'Tripulante',                       'embarcado',  NULL),
  (NULL, 'guardia_puerto',       'Guardia / sereno en puerto',       'embarcado',  'Firma RO-10C'),
  (NULL, 'personal_tercerizado', 'Personal tercerizado',             'tierra',     'Alcanzado por RO-03D'),
  (NULL, 'asesor_externo',       'Asesor externo',                   'plataforma', 'Opera sobre varias empresas'),
  (NULL, 'admin_plataforma',     'Administrador de plataforma',      'plataforma', NULL);


CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid REFERENCES companies(id) ON DELETE RESTRICT,
  default_vessel_id    uuid,
  full_name            text NOT NULL,
  dni                  text,
  email                text,
  phone                text,
  password_hash        text,
  pin_hash             text,
  signature_on_file_url text,
  status               text NOT NULL DEFAULT 'activo'
                         CHECK (status IN ('activo','inactivo','bloqueado')),
  last_login_at        timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_default_vessel_fk
    FOREIGN KEY (default_vessel_id, company_id) REFERENCES vessels (id, company_id),
  CONSTRAINT users_id_company_key UNIQUE (id, company_id)
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_company_dni_key ON users (company_id, dni) WHERE dni IS NOT NULL;
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON COLUMN users.company_id IS
  'NULL para asesores externos / admins que operan sobre varias empresas.';
COMMENT ON COLUMN users.pin_hash IS
  'Hash del PIN de confirmación. El método de firma aceptable por PNA está pendiente '
  'de definición: el esquema soporta canvas y PIN sin comprometerse a uno.';


CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vessel_id   uuid,
  valid_from  date NOT NULL DEFAULT current_date,
  valid_to    date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_vessel_fk
    FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT user_roles_period_chk CHECK (valid_to IS NULL OR valid_to >= valid_from),
  -- Una misma persona no puede tener el mismo rol, en el mismo buque, dos veces
  -- en periodos que se solapen. Permite el histórico de relevos (RMGS-02).
  CONSTRAINT user_roles_no_overlap EXCLUDE USING gist (
    user_id WITH =,
    role_id WITH =,
    coalesce(vessel_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    daterange(valid_from, valid_to, '[]') WITH &&
  )
);

CREATE INDEX user_roles_user_idx    ON user_roles (user_id);
CREATE INDEX user_roles_company_idx ON user_roles (company_id, role_id);
CREATE INDEX user_roles_vessel_idx  ON user_roles (vessel_id) WHERE vessel_id IS NOT NULL;

COMMENT ON TABLE user_roles IS
  'Rol con vigencia. Modelado como tabla aparte (no columna en users) porque una '
  'persona cambia de buque y de puesto, y el histórico debe sobrevivir al cambio.';


-- ¿El usuario tiene el rol <code> vigente a la fecha <at>, opcionalmente en <vessel>?
CREATE OR REPLACE FUNCTION sgs_user_has_role(
  p_user_id uuid, p_role_code text, p_vessel_id uuid DEFAULT NULL, p_at date DEFAULT current_date
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND r.code = p_role_code
      AND r.status = 'activo'
      AND daterange(ur.valid_from, ur.valid_to, '[]') @> p_at
      AND (p_vessel_id IS NULL OR ur.vessel_id IS NULL OR ur.vessel_id = p_vessel_id)
  );
$$;

-- Códigos de rol vigentes de un usuario (para chequear allowed_creator_roles).
CREATE OR REPLACE FUNCTION sgs_user_role_codes(
  p_user_id uuid, p_at date DEFAULT current_date
) RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT r.code), '{}')
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id
    AND r.status = 'activo'
    AND daterange(ur.valid_from, ur.valid_to, '[]') @> p_at;
$$;
