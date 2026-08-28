-- 0004_catalog.sql
-- Catálogo configurable por empresa: manual_versions -> procedures -> record_types.
-- Nada del dominio ("PE-01", "RMGS-04") vive en el código de la aplicación.

CREATE TYPE manual_status AS ENUM ('borrador', 'vigente', 'superada');
CREATE TYPE catalog_status AS ENUM ('vigente', 'derogado');
CREATE TYPE record_category AS ENUM (
  'master_data',         -- RMGS-04, RMGS-06: fichas maestras
  'scheduled_checklist', -- RE-01A, RO-05x, RO-10C: recurrentes
  'incident_event',      -- RE-01B..E, RO-07A/B: por hecho
  'management_review',   -- RA-06A/B/C
  'risk_assessment',     -- RO-08
  'inactive_vessel'      -- RO-10A/B
);
CREATE TYPE recurrence_type AS ENUM ('none', 'on_event', 'daily', 'monthly', 'fixed_interval_days');
CREATE TYPE record_scope AS ENUM ('company', 'vessel');
CREATE TYPE signature_requirement AS ENUM ('none', 'manuscrita', 'pin', 'ambas', 'configurable_por_firmante');

-- ---------------------------------------------------------------------------
-- manual_versions  (Rev. 04, Rev. 05, ... de cada empresa)
-- ---------------------------------------------------------------------------
CREATE TABLE manual_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  revision_number text NOT NULL,            -- "Rev. 04"
  regulation      text,                     -- "Ord. PNA 05/18"
  effective_date  date,
  status          manual_status NOT NULL DEFAULT 'borrador',
  source_document_id uuid,                  -- FK a attachments, se agrega en 0006
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_versions_company_revision_key UNIQUE (company_id, revision_number),
  CONSTRAINT manual_versions_id_company_key UNIQUE (id, company_id),
  CONSTRAINT manual_versions_vigente_needs_date
    CHECK (status <> 'vigente' OR effective_date IS NOT NULL)
);
-- Una sola revisión vigente por empresa: es lo que hace inequívoco qué catálogo
-- rige hoy a bordo.
CREATE UNIQUE INDEX manual_versions_one_vigente_per_company
  ON manual_versions (company_id) WHERE status = 'vigente';
CREATE TRIGGER manual_versions_set_updated_at BEFORE UPDATE ON manual_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- ---------------------------------------------------------------------------
-- procedures  (PE-01, PO-02, ..., PA-06)
-- ---------------------------------------------------------------------------
CREATE TABLE procedures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_version_id uuid NOT NULL REFERENCES manual_versions (id) ON DELETE CASCADE,
  company_id        uuid NOT NULL,
  code              text NOT NULL,          -- libre: cada empresa define el suyo
  name              text NOT NULL,
  sort_order        integer NOT NULL DEFAULT 0,
  status            catalog_status NOT NULL DEFAULT 'vigente',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (manual_version_id, company_id) REFERENCES manual_versions (id, company_id) ON DELETE CASCADE,
  CONSTRAINT procedures_manual_code_key UNIQUE (manual_version_id, code),
  CONSTRAINT procedures_id_company_key UNIQUE (id, company_id),
  CONSTRAINT procedures_code_not_blank CHECK (btrim(code) <> '')
);
CREATE TRIGGER procedures_set_updated_at BEFORE UPDATE ON procedures
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- "Historial del procedimiento" (Fecha/Revisión/Descripción/Responsable al pie
-- de cada formulario del PDF): es el changelog del procedimiento, no un
-- registro operativo.
CREATE TABLE procedure_revisions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id   uuid NOT NULL REFERENCES procedures (id) ON DELETE CASCADE,
  revision_number text NOT NULL,
  changed_at     date NOT NULL,
  description    text NOT NULL,
  responsible_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  responsible_name    text,                 -- si el responsable histórico no es usuario del sistema
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedure_revisions_key UNIQUE (procedure_id, revision_number)
);

-- ---------------------------------------------------------------------------
-- record_types  (la plantilla del formulario)
-- ---------------------------------------------------------------------------
CREATE TABLE record_types (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id           uuid NOT NULL REFERENCES procedures (id) ON DELETE CASCADE,
  company_id             uuid NOT NULL,
  code                   text NOT NULL,     -- "RE-01A", "RMGS-04", "RO-05B"
  name                   text NOT NULL,
  category               record_category NOT NULL,
  recurrence_type        recurrence_type NOT NULL DEFAULT 'on_event',
  recurrence_days        integer,           -- 30 / 60 / 365 para fixed_interval_days
  scope                  record_scope NOT NULL DEFAULT 'vessel',
  allowed_creator_roles  text[] NOT NULL DEFAULT '{}',  -- '{}' = sin restricción
  allowed_reviewer_roles text[] NOT NULL DEFAULT '{}',
  signature_requirement  signature_requirement NOT NULL DEFAULT 'configurable_por_firmante',
  field_schema           jsonb NOT NULL DEFAULT '[]'::jsonb,
  version                integer NOT NULL DEFAULT 1,
  status                 catalog_status NOT NULL DEFAULT 'vigente',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (procedure_id, company_id) REFERENCES procedures (id, company_id) ON DELETE CASCADE,
  CONSTRAINT record_types_procedure_code_key UNIQUE (procedure_id, code),
  CONSTRAINT record_types_id_company_key UNIQUE (id, company_id),
  CONSTRAINT record_types_id_version_key UNIQUE (id, version),
  CONSTRAINT record_types_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT record_types_recurrence_days_coherent CHECK (
    (recurrence_type = 'fixed_interval_days' AND recurrence_days IS NOT NULL AND recurrence_days > 0)
    OR (recurrence_type <> 'fixed_interval_days' AND recurrence_days IS NULL)
  ),
  CONSTRAINT record_types_field_schema_valid CHECK (sgs_validate_field_schema(field_schema))
);
CREATE INDEX record_types_company_status_idx ON record_types (company_id, status);
CREATE INDEX record_types_recurrence_idx ON record_types (recurrence_type)
  WHERE status = 'vigente' AND recurrence_type <> 'on_event';
CREATE INDEX record_types_field_schema_idx ON record_types USING gin (field_schema jsonb_path_ops);
CREATE TRIGGER record_types_set_updated_at BEFORE UPDATE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- Snapshot inmutable de cada versión del formulario: sin esto, revisar un
-- record_type rompería la lectura de las instancias históricas ya firmadas.
CREATE TABLE record_type_versions (
  record_type_id        uuid NOT NULL REFERENCES record_types (id) ON DELETE CASCADE,
  version               integer NOT NULL,
  name                  text NOT NULL,
  field_schema          jsonb NOT NULL,
  signature_requirement signature_requirement NOT NULL,
  allowed_creator_roles text[] NOT NULL,
  captured_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (record_type_id, version)
);

-- Al cambiar el formulario (field_schema / firmas / nombre) se sube version y
-- se congela la versión anterior.
CREATE OR REPLACE FUNCTION sgs_snapshot_record_type() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.field_schema IS DISTINCT FROM OLD.field_schema
       OR NEW.signature_requirement IS DISTINCT FROM OLD.signature_requirement
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.allowed_creator_roles IS DISTINCT FROM OLD.allowed_creator_roles THEN
      IF NEW.version = OLD.version THEN
        NEW.version := OLD.version + 1;
      ELSIF NEW.version < OLD.version THEN
        RAISE EXCEPTION 'record_types.version no puede retroceder (% -> %)', OLD.version, NEW.version
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_types_bump_version BEFORE UPDATE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_snapshot_record_type();

CREATE OR REPLACE FUNCTION sgs_store_record_type_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO record_type_versions (record_type_id, version, name, field_schema,
                                    signature_requirement, allowed_creator_roles)
  VALUES (NEW.id, NEW.version, NEW.name, NEW.field_schema,
          NEW.signature_requirement, NEW.allowed_creator_roles)
  ON CONFLICT (record_type_id, version) DO NOTHING;
  RETURN NULL;
END;
$$;
CREATE TRIGGER record_types_store_version AFTER INSERT OR UPDATE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_store_record_type_version();

-- Validaciones que cruzan tablas (no pueden ir en un CHECK):
--  * los roles declarados en allowed_*_roles y en los signature_block existen;
--  * triggers_record_type apunta a un código de registro del mismo manual.
CREATE OR REPLACE FUNCTION sgs_check_record_type_refs() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  role_code   text;
  target_code text;
  manual_id   uuid;
BEGIN
  FOREACH role_code IN ARRAY (NEW.allowed_creator_roles || NEW.allowed_reviewer_roles) LOOP
    IF NOT EXISTS (SELECT 1 FROM roles r
                   WHERE r.code = role_code
                     AND (r.company_id IS NULL OR r.company_id = NEW.company_id)) THEN
      RAISE EXCEPTION 'Rol inexistente en allowed_*_roles: %', role_code
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;

  FOR role_code IN
    SELECT f ->> 'signer_role'
    FROM jsonb_array_elements(NEW.field_schema) f
    WHERE f ->> 'type' = 'signature_block'
  LOOP
    IF NOT EXISTS (SELECT 1 FROM roles r
                   WHERE r.code = role_code
                     AND (r.company_id IS NULL OR r.company_id = NEW.company_id)) THEN
      RAISE EXCEPTION 'signer_role inexistente en field_schema: %', role_code
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;

  SELECT p.manual_version_id INTO manual_id FROM procedures p WHERE p.id = NEW.procedure_id;
  FOR target_code IN
    SELECT f ->> 'triggers_record_type'
    FROM jsonb_array_elements(NEW.field_schema) f
    WHERE f ? 'triggers_record_type'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM record_types rt
      JOIN procedures p ON p.id = rt.procedure_id
      WHERE p.manual_version_id = manual_id AND rt.code = target_code
    ) THEN
      RAISE EXCEPTION 'triggers_record_type apunta a un registro inexistente en este manual: %', target_code
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
-- CONSTRAINT TRIGGER diferible: valida al vuelo en la operación normal, pero
-- una carga masiva de catálogo puede pedir `SET CONSTRAINTS ALL DEFERRED` para
-- insertar RE-01D antes que el RO-07A que referencia.
CREATE CONSTRAINT TRIGGER record_types_check_refs
  AFTER INSERT OR UPDATE ON record_types
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION sgs_check_record_type_refs();
