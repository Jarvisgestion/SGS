-- 0003_catalog.sql
-- El catálogo configurable por empresa:
--   manual_versions -> procedures -> record_types -> record_type_versions
-- Nada del dominio ("PE-01", "RMGS-04") vive en el código de la aplicación.

CREATE TABLE manual_versions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  revision_number      text NOT NULL,          -- "Rev. 04"
  regulation_reference text,                   -- "Ord. PNA 05/18"
  effective_date       date,
  status               text NOT NULL DEFAULT 'borrador'
                         CHECK (status IN ('borrador','vigente','superada')),
  source_attachment_id uuid,                   -- FK se agrega en 0005 (attachments)
  notes                text,
  created_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_versions_company_revision_key UNIQUE (company_id, revision_number),
  CONSTRAINT manual_versions_id_company_key UNIQUE (id, company_id)
);

-- Una sola revisión vigente por empresa.
CREATE UNIQUE INDEX manual_versions_one_current_key
  ON manual_versions (company_id) WHERE status = 'vigente';
CREATE TRIGGER manual_versions_set_updated_at BEFORE UPDATE ON manual_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();


CREATE TABLE procedures (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_version_id  uuid NOT NULL,
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code               text NOT NULL,            -- "PE-01", "PM-04" (libre, no enum)
  name               text NOT NULL,
  purpose            text,
  sort_order         integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'vigente'
                       CHECK (status IN ('vigente','derogado')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedures_manual_fk
    FOREIGN KEY (manual_version_id, company_id)
    REFERENCES manual_versions (id, company_id) ON DELETE CASCADE,
  CONSTRAINT procedures_manual_code_key UNIQUE (manual_version_id, code),
  CONSTRAINT procedures_id_company_key UNIQUE (id, company_id)
);

CREATE TRIGGER procedures_set_updated_at BEFORE UPDATE ON procedures
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();


CREATE TABLE record_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id        uuid NOT NULL,
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code                text NOT NULL,           -- "RE-01A", "RMGS-04", "RO-05B"
  name                text NOT NULL,
  category            text NOT NULL CHECK (category IN (
                        'master_data','scheduled_checklist','incident_event',
                        'management_review','risk_assessment','inactive_vessel')),
  scope               text NOT NULL CHECK (scope IN ('company','vessel','vessel_optional')),
  current_version_id  uuid,
  sort_order          integer NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'vigente'
                        CHECK (status IN ('vigente','derogado')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_types_procedure_fk
    FOREIGN KEY (procedure_id, company_id)
    REFERENCES procedures (id, company_id) ON DELETE CASCADE,
  CONSTRAINT record_types_procedure_code_key UNIQUE (procedure_id, code),
  CONSTRAINT record_types_id_company_key UNIQUE (id, company_id)
);

CREATE TRIGGER record_types_set_updated_at BEFORE UPDATE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON COLUMN record_types.scope IS
  'company = registro de la empresa (sin buque). vessel = siempre de un buque. '
  'vessel_optional = puede ser de empresa o de un buque (NNC, capacitación, '
  'análisis de riesgo): el hallazgo puede ser de tierra o de a bordo.';

COMMENT ON TABLE record_types IS
  'Identidad estable de un tipo de registro. Lo que cambia entre revisiones del MGS '
  '(campos, recurrencia, firmas, roles habilitados) vive en record_type_versions.';


-- Una fila por revisión del formulario. Es también el "Historial del procedimiento"
-- que el MGS imprime al pie de cada procedimiento.
CREATE TABLE record_type_versions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type_id         uuid NOT NULL REFERENCES record_types(id) ON DELETE CASCADE,
  company_id             uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  version                integer NOT NULL CHECK (version > 0),
  recurrence_type        text NOT NULL DEFAULT 'none' CHECK (recurrence_type IN (
                           'none','on_event','daily','monthly','fixed_interval_days')),
  recurrence_days        integer CHECK (recurrence_days > 0),
  allowed_creator_roles  text[] NOT NULL DEFAULT '{}',
  allowed_reviewer_roles text[] NOT NULL DEFAULT '{}',
  signature_requirement  text NOT NULL DEFAULT 'configurable_por_firmante'
                           CHECK (signature_requirement IN (
                             'none','manuscrita','pin','ambas','configurable_por_firmante')),
  field_schema           jsonb NOT NULL DEFAULT '[]'::jsonb,
  change_description     text,                 -- qué cambió respecto de la versión anterior
  changed_by             uuid REFERENCES users(id),
  effective_from         date,
  status                 text NOT NULL DEFAULT 'vigente'
                           CHECK (status IN ('borrador','vigente','superada')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_type_versions_rt_version_key UNIQUE (record_type_id, version),
  CONSTRAINT record_type_versions_id_rt_key UNIQUE (id, record_type_id),
  CONSTRAINT record_type_versions_recurrence_days_chk CHECK (
    (recurrence_type =  'fixed_interval_days' AND recurrence_days IS NOT NULL) OR
    (recurrence_type <> 'fixed_interval_days' AND recurrence_days IS NULL)
  )
);

ALTER TABLE record_types
  ADD CONSTRAINT record_types_current_version_fk
  FOREIGN KEY (current_version_id, id)
  REFERENCES record_type_versions (id, record_type_id) DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE record_type_versions IS
  'Versión inmutable del formulario. Las instancias apuntan a la versión con la que '
  'fueron completadas, así una nueva revisión del MGS no reescribe el histórico firmado.';


-- ---------------------------------------------------------------------------
-- Validación de field_schema
-- ---------------------------------------------------------------------------
-- Tipos de campo soportados. Los 9 primeros salen del relevamiento
-- (docs/01, "Patrones detectados"); el resto se agregó al escribir los
-- formularios reales de la semilla (RM-04B necesita number, RO-10C datetime, etc.).
CREATE OR REPLACE FUNCTION sgs_field_types() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'text','textarea','date','time','datetime','number','select','multiselect',
    'boolean','checklist','table','signature_block','file','risk_reference',
    'user_reference','vessel_reference','section'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION sgs_validate_field_schema(p_schema jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  fld    jsonb;
  col    jsonb;
  k      text;
  t      text;
  seen   text[] := '{}';
BEGIN
  IF jsonb_typeof(p_schema) <> 'array' THEN
    RAISE EXCEPTION 'field_schema debe ser un array JSON, se recibió %', jsonb_typeof(p_schema)
      USING ERRCODE = 'check_violation';
  END IF;

  FOR fld IN SELECT jsonb_array_elements(p_schema) LOOP
    IF jsonb_typeof(fld) <> 'object' THEN
      RAISE EXCEPTION 'cada campo de field_schema debe ser un objeto, se recibió %',
        jsonb_typeof(fld) USING ERRCODE = 'check_violation';
    END IF;

    k := fld ->> 'key';
    t := fld ->> 'type';

    IF k IS NULL OR k = '' THEN
      RAISE EXCEPTION 'campo sin "key" en field_schema: %', fld
        USING ERRCODE = 'check_violation';
    END IF;
    IF k = ANY (seen) THEN
      RAISE EXCEPTION 'key duplicada en field_schema: "%"', k
        USING ERRCODE = 'check_violation';
    END IF;
    seen := seen || k;

    IF t IS NULL OR NOT (t = ANY (sgs_field_types())) THEN
      RAISE EXCEPTION 'tipo de campo inválido "%" en la key "%". Válidos: %',
        coalesce(t,'(null)'), k, array_to_string(sgs_field_types(), ', ')
        USING ERRCODE = 'check_violation';
    END IF;

    -- select/multiselect/checklist necesitan opciones
    IF t IN ('select','multiselect','checklist') THEN
      -- coalesce: si la clave falta, jsonb_typeof devuelve NULL y el IF nunca dispara.
      IF coalesce(jsonb_typeof(fld -> 'options'), 'ausente') <> 'array'
         OR jsonb_array_length(fld -> 'options') = 0 THEN
        RAISE EXCEPTION 'el campo "%" de tipo % requiere un array "options" no vacío', k, t
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- table necesita columnas, cada una con key y type válidos
    IF t = 'table' THEN
      IF coalesce(jsonb_typeof(fld -> 'columns'), 'ausente') <> 'array'
         OR jsonb_array_length(fld -> 'columns') = 0 THEN
        RAISE EXCEPTION 'el campo "%" de tipo table requiere un array "columns" no vacío', k
          USING ERRCODE = 'check_violation';
      END IF;
      FOR col IN SELECT jsonb_array_elements(fld -> 'columns') LOOP
        IF (col ->> 'key') IS NULL THEN
          RAISE EXCEPTION 'columna sin "key" en la tabla "%"', k
            USING ERRCODE = 'check_violation';
        END IF;
        IF (col ->> 'type') IS NULL OR NOT ((col ->> 'type') = ANY (sgs_field_types())) THEN
          RAISE EXCEPTION 'tipo inválido "%" en la columna "%" de la tabla "%"',
            coalesce(col ->> 'type','(null)'), col ->> 'key', k
            USING ERRCODE = 'check_violation';
        END IF;
        IF (col ->> 'type') = 'table' THEN
          RAISE EXCEPTION 'la columna "%" de la tabla "%" no puede ser de tipo table (sin anidamiento)',
            col ->> 'key', k USING ERRCODE = 'check_violation';
        END IF;
      END LOOP;
    END IF;

    -- signature_block declara con qué rol se firma ese punto del formulario
    IF t = 'signature_block' AND (fld ->> 'signer_role') IS NULL THEN
      RAISE EXCEPTION 'el signature_block "%" requiere "signer_role"', k
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION sgs_validate_field_schema(jsonb) IS
  'Valida la forma de un field_schema antes de guardarlo: evita que un catálogo mal '
  'cargado rompa recién al momento de completar el formulario a bordo.';


-- Todo código de rol referenciado debe existir (global o de la empresa).
CREATE OR REPLACE FUNCTION sgs_validate_role_codes(p_company_id uuid, p_codes text[])
RETURNS void LANGUAGE plpgsql STABLE AS $$
DECLARE missing text[];
BEGIN
  SELECT coalesce(array_agg(c), '{}') INTO missing
  FROM unnest(p_codes) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM roles r
    WHERE r.code = c AND (r.company_id IS NULL OR r.company_id = p_company_id)
  );

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'códigos de rol inexistentes: %', array_to_string(missing, ', ')
      USING ERRCODE = 'foreign_key_violation';
  END IF;
END $$;


CREATE OR REPLACE FUNCTION sgs_record_type_version_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_rt_company uuid;
BEGIN
  SELECT company_id INTO v_rt_company FROM record_types WHERE id = NEW.record_type_id;
  IF v_rt_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'company_id de la versión (%) no coincide con el del record_type (%)',
      NEW.company_id, v_rt_company USING ERRCODE = 'check_violation';
  END IF;

  PERFORM sgs_validate_field_schema(NEW.field_schema);
  PERFORM sgs_validate_role_codes(NEW.company_id, NEW.allowed_creator_roles);
  PERFORM sgs_validate_role_codes(NEW.company_id, NEW.allowed_reviewer_roles);
  RETURN NEW;
END $$;

CREATE TRIGGER record_type_versions_validate
  BEFORE INSERT OR UPDATE ON record_type_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_record_type_version_validate();


-- Una versión ya usada por un registro no se puede reescribir: se crea una nueva.
CREATE OR REPLACE FUNCTION sgs_record_type_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM record_instances WHERE record_type_version_id = OLD.id) THEN
    IF NEW.field_schema IS DISTINCT FROM OLD.field_schema THEN
      RAISE EXCEPTION
        'no se puede modificar field_schema de la versión % del tipo %: ya tiene registros cargados. Cree una versión nueva.',
        OLD.version, OLD.record_type_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
-- El trigger se instala en 0004, cuando ya existe record_instances.
