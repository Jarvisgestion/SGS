-- 0005_records.sql
-- Instancias de registro, revisiones, firmas y adjuntos.

CREATE TYPE record_status AS ENUM ('borrador', 'pendiente_revision', 'aprobado', 'observado');
CREATE TYPE review_decision AS ENUM ('aprobado', 'observado');
CREATE TYPE signature_method AS ENUM ('canvas', 'pin');

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
CREATE TABLE attachments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  file_url    text NOT NULL,
  file_name   text,
  file_type   text NOT NULL,              -- pdf | image | email | other
  byte_size   bigint,
  checksum    text,                       -- sha256, para probar integridad ante PNA
  uploaded_by uuid REFERENCES users (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_file_type_known CHECK (file_type IN ('pdf', 'image', 'email', 'other')),
  CONSTRAINT attachments_id_company_key UNIQUE (id, company_id)
);

ALTER TABLE users
  ADD CONSTRAINT users_signature_file_fk
  FOREIGN KEY (signature_file_id) REFERENCES attachments (id) ON DELETE SET NULL;
ALTER TABLE manual_versions
  ADD CONSTRAINT manual_versions_source_document_fk
  FOREIGN KEY (source_document_id) REFERENCES attachments (id) ON DELETE SET NULL;
ALTER TABLE vessel_certificates
  ADD COLUMN attachment_id uuid REFERENCES attachments (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Validación de `data` contra el field_schema de la versión usada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_validate_record_data(schema jsonb, data jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  field   jsonb;
  row_val jsonb;
  item    jsonb;
  fkey    text;
  ftype   text;
  val     jsonb;
  known   text[] := ARRAY[]::text[];
  extra   text;
  cols    text[];
BEGIN
  IF jsonb_typeof(data) <> 'object' THEN
    RAISE EXCEPTION 'record_instances.data debe ser un objeto JSON';
  END IF;

  FOR field IN SELECT * FROM jsonb_array_elements(schema) LOOP
    fkey  := field ->> 'key';
    ftype := field ->> 'type';
    known := known || fkey;
    val   := data -> fkey;

    -- Las firmas viven en la tabla `signatures`, no dentro de `data`.
    IF ftype = 'signature_block' THEN
      IF val IS NOT NULL THEN
        RAISE EXCEPTION 'El campo % es un signature_block: la firma se guarda en signatures, no en data', fkey;
      END IF;
      CONTINUE;
    END IF;

    IF val IS NULL OR jsonb_typeof(val) = 'null' THEN
      IF coalesce((field ->> 'required')::boolean, false) THEN
        RAISE EXCEPTION 'Falta el campo obligatorio %', fkey;
      END IF;
      CONTINUE;
    END IF;

    CASE ftype
      WHEN 'boolean' THEN
        IF jsonb_typeof(val) <> 'boolean' THEN
          RAISE EXCEPTION 'El campo % debe ser booleano', fkey;
        END IF;

      WHEN 'number' THEN
        IF jsonb_typeof(val) <> 'number' THEN
          RAISE EXCEPTION 'El campo % debe ser numérico', fkey;
        END IF;

      WHEN 'date' THEN
        IF jsonb_typeof(val) <> 'string' OR (val #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
          RAISE EXCEPTION 'El campo % debe ser una fecha ISO (YYYY-MM-DD)', fkey;
        END IF;

      WHEN 'time' THEN
        IF jsonb_typeof(val) <> 'string' OR (val #>> '{}') !~ '^\d{2}:\d{2}(:\d{2})?$' THEN
          RAISE EXCEPTION 'El campo % debe ser una hora (HH:MM)', fkey;
        END IF;

      WHEN 'select' THEN
        IF NOT (field -> 'options' @> jsonb_build_array(val)) THEN
          RAISE EXCEPTION 'Valor fuera de las opciones declaradas en el campo %', fkey;
        END IF;

      WHEN 'multiselect' THEN
        IF jsonb_typeof(val) <> 'array' THEN
          RAISE EXCEPTION 'El campo % debe ser un array', fkey;
        END IF;
        IF NOT (field -> 'options' @> val) THEN
          RAISE EXCEPTION 'Valor fuera de las opciones declaradas en el campo %', fkey;
        END IF;

      WHEN 'checklist' THEN
        -- [{ "item": "...", "status": "ok|no_ok|na", "observacion": "..." }]
        IF jsonb_typeof(val) <> 'array' THEN
          RAISE EXCEPTION 'El checklist % debe ser un array de ítems', fkey;
        END IF;
        FOR item IN SELECT * FROM jsonb_array_elements(val) LOOP
          IF NOT (field -> 'options' @> jsonb_build_array(item -> 'item')) THEN
            RAISE EXCEPTION 'Ítem no declarado en el checklist %: %', fkey, item ->> 'item';
          END IF;
          IF coalesce(item ->> 'status', '') NOT IN ('ok', 'no_ok', 'na') THEN
            RAISE EXCEPTION 'Estado inválido en el checklist % (esperado ok|no_ok|na)', fkey;
          END IF;
        END LOOP;

      WHEN 'table' THEN
        IF jsonb_typeof(val) <> 'array' THEN
          RAISE EXCEPTION 'El campo tabla % debe ser un array de filas', fkey;
        END IF;
        SELECT array_agg(c ->> 'key') INTO cols
        FROM jsonb_array_elements(field -> 'columns') c;
        FOR row_val IN SELECT * FROM jsonb_array_elements(val) LOOP
          IF jsonb_typeof(row_val) <> 'object' THEN
            RAISE EXCEPTION 'Cada fila de la tabla % debe ser un objeto', fkey;
          END IF;
          SELECT k INTO extra FROM jsonb_object_keys(row_val) k WHERE NOT (k = ANY (cols)) LIMIT 1;
          IF extra IS NOT NULL THEN
            RAISE EXCEPTION 'Columna no declarada "%" en la tabla %', extra, fkey;
          END IF;
        END LOOP;

      WHEN 'risk_reference', 'user_reference', 'file' THEN
        IF jsonb_typeof(val) <> 'string' OR (val #>> '{}') !~* '^[0-9a-f-]{36}$' THEN
          RAISE EXCEPTION 'El campo % debe referenciar un uuid', fkey;
        END IF;

      ELSE
        NULL; -- text / textarea / datetime: sin validación adicional
    END CASE;
  END LOOP;

  SELECT k INTO extra FROM jsonb_object_keys(data) k WHERE NOT (k = ANY (known)) LIMIT 1;
  IF extra IS NOT NULL THEN
    RAISE EXCEPTION 'Campo no declarado en el formulario: %', extra;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- record_instances
-- ---------------------------------------------------------------------------
CREATE TABLE record_instances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  record_type_id      uuid NOT NULL,
  record_type_version integer NOT NULL,     -- versión congelada del formulario
  vessel_id           uuid,                 -- NULL sólo si el record_type es de scope=company
  marea               text,
  singladura          text,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  data                jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              record_status NOT NULL DEFAULT 'borrador',
  parent_record_instance_id uuid REFERENCES record_instances (id) ON DELETE SET NULL,
  created_by          uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  submitted_at        timestamptz,
  synced_at           timestamptz,          -- llegada desde el buque (borrador offline)
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (record_type_id, company_id) REFERENCES record_types (id, company_id) ON DELETE RESTRICT,
  FOREIGN KEY (record_type_id, record_type_version)
    REFERENCES record_type_versions (record_type_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE RESTRICT,
  CONSTRAINT record_instances_data_is_object CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT record_instances_id_company_key UNIQUE (id, company_id),
  CONSTRAINT record_instances_submitted_coherent
    CHECK (status = 'borrador' OR submitted_at IS NOT NULL)
);
CREATE INDEX record_instances_lookup_idx
  ON record_instances (company_id, record_type_id, occurred_at DESC);
CREATE INDEX record_instances_vessel_idx
  ON record_instances (vessel_id, occurred_at DESC) WHERE vessel_id IS NOT NULL;
CREATE INDEX record_instances_pending_idx
  ON record_instances (company_id, status) WHERE status IN ('pendiente_revision', 'observado');
CREATE INDEX record_instances_data_idx ON record_instances USING gin (data jsonb_path_ops);
CREATE INDEX record_instances_parent_idx ON record_instances (parent_record_instance_id)
  WHERE parent_record_instance_id IS NOT NULL;
CREATE TRIGGER record_instances_set_updated_at BEFORE UPDATE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- Reglas de negocio de la instancia:
--  * scope=vessel exige buque, scope=company lo prohíbe;
--  * el creador debe tener alguno de los allowed_creator_roles (ej. la NNC sólo
--    la emiten ciertos roles);
--  * `data` se valida contra el field_schema al salir de borrador;
--  * un registro aprobado es de sólo lectura.
CREATE OR REPLACE FUNCTION sgs_check_record_instance() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rt          record_types%ROWTYPE;
  frozen      jsonb;
  user_roles_ text[];
BEGIN
  SELECT * INTO rt FROM record_types WHERE id = NEW.record_type_id;

  IF rt.scope = 'vessel' AND NEW.vessel_id IS NULL THEN
    RAISE EXCEPTION 'El registro % es de alcance buque: falta vessel_id', rt.code
      USING ERRCODE = 'check_violation';
  END IF;
  IF rt.scope = 'company' AND NEW.vessel_id IS NOT NULL THEN
    RAISE EXCEPTION 'El registro % es de alcance compañía: no lleva vessel_id', rt.code
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'aprobado' THEN
    RAISE EXCEPTION 'El registro % ya está aprobado: es de sólo lectura', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.record_type_id <> OLD.record_type_id THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de registro de una instancia existente'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'INSERT' AND array_length(rt.allowed_creator_roles, 1) IS NOT NULL
     AND NEW.created_by IS NOT NULL THEN
    user_roles_ := sgs_user_role_codes(NEW.created_by, NEW.vessel_id, NEW.occurred_at::date);
    IF NOT (user_roles_ && rt.allowed_creator_roles) THEN
      RAISE EXCEPTION 'El usuario no tiene un rol habilitado para emitir % (habilitados: %)',
        rt.code, array_to_string(rt.allowed_creator_roles, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.status <> 'borrador' THEN
    SELECT field_schema INTO frozen FROM record_type_versions
    WHERE record_type_id = NEW.record_type_id AND version = NEW.record_type_version;
    PERFORM sgs_validate_record_data(frozen, NEW.data);
    IF NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER record_instances_check BEFORE INSERT OR UPDATE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_check_record_instance();

-- ---------------------------------------------------------------------------
-- record_reviews  (historial de revisión desde tierra: fuente de verdad)
-- ---------------------------------------------------------------------------
CREATE TABLE record_reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_instance_id uuid NOT NULL REFERENCES record_instances (id) ON DELETE CASCADE,
  reviewer_id        uuid REFERENCES users (id) ON DELETE SET NULL,
  decision           review_decision NOT NULL,
  comment            text,
  reviewed_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_reviews_observado_needs_comment
    CHECK (decision <> 'observado' OR btrim(coalesce(comment, '')) <> '')
);
CREATE INDEX record_reviews_instance_idx ON record_reviews (record_instance_id, reviewed_at DESC);

-- El status de la instancia es derivado de la última revisión; la tabla de
-- revisiones es la que se muestra ante una inspección.
CREATE OR REPLACE FUNCTION sgs_apply_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  inst record_instances%ROWTYPE;
BEGIN
  SELECT * INTO inst FROM record_instances WHERE id = NEW.record_instance_id FOR UPDATE;

  IF inst.status = 'borrador' THEN
    RAISE EXCEPTION 'No se puede revisar un registro en borrador (aún no fue enviado)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF inst.status = 'aprobado' THEN
    RAISE EXCEPTION 'El registro ya fue aprobado: no admite nuevas revisiones'
      USING ERRCODE = 'restrict_violation';
  END IF;

  UPDATE record_instances
     SET status = NEW.decision::text::record_status
   WHERE id = NEW.record_instance_id;

  RETURN NEW;
END;
$$;
CREATE TRIGGER record_reviews_apply AFTER INSERT ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_apply_review();

CREATE TRIGGER record_reviews_append_only BEFORE UPDATE OR DELETE ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_forbid_mutation();

-- ---------------------------------------------------------------------------
-- signatures
--
-- N firmas por instancia, cada una con el rol del acto (entrega/recibe,
-- saliente/entrante, pedido/recibido/conforme).
-- ---------------------------------------------------------------------------
CREATE TABLE signatures (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_instance_id uuid REFERENCES record_instances (id) ON DELETE CASCADE,
  record_review_id   uuid REFERENCES record_reviews (id) ON DELETE CASCADE,
  signer_user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  signer_name        text NOT NULL,        -- aclaración impresa en el formulario
  signer_role        text NOT NULL,        -- "mando_saliente", "entrega", "conforme"...
  field_key          text,                 -- signature_block del field_schema que satisface
  method             signature_method NOT NULL,
  signature_image_id uuid REFERENCES attachments (id) ON DELETE SET NULL,
  device_metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  signed_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signatures_target_present
    CHECK (num_nonnulls(record_instance_id, record_review_id) = 1),
  CONSTRAINT signatures_canvas_needs_image
    CHECK (method <> 'canvas' OR signature_image_id IS NOT NULL)
);
CREATE INDEX signatures_instance_idx ON signatures (record_instance_id);
CREATE UNIQUE INDEX signatures_instance_field_key
  ON signatures (record_instance_id, field_key)
  WHERE record_instance_id IS NOT NULL AND field_key IS NOT NULL;

-- Una firma no se edita ni se borra: si estuvo mal, se firma de nuevo con otro
-- acto y queda el rastro de los dos.
CREATE TRIGGER signatures_append_only BEFORE UPDATE OR DELETE ON signatures
  FOR EACH ROW EXECUTE FUNCTION sgs_forbid_mutation();

ALTER TABLE attachments
  ADD COLUMN record_instance_id uuid REFERENCES record_instances (id) ON DELETE CASCADE,
  ADD COLUMN vessel_certificate_id uuid REFERENCES vessel_certificates (id) ON DELETE CASCADE;
CREATE INDEX attachments_record_instance_idx ON attachments (record_instance_id)
  WHERE record_instance_id IS NOT NULL;
