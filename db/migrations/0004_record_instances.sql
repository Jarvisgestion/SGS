-- 0004_record_instances.sql
-- Instancias de registro (el formulario concreto completado a bordo), su historial
-- de revisión y sus firmas.

CREATE TABLE record_instances (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  record_type_id            uuid NOT NULL,
  record_type_version_id    uuid NOT NULL,
  vessel_id                 uuid,
  marea                     text,
  singladura                text,
  occurred_at               timestamptz NOT NULL,
  period_start              date,
  period_end                date,
  data                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                    text NOT NULL DEFAULT 'borrador'
                              CHECK (status IN ('borrador','pendiente_revision','aprobado','observado')),
  parent_record_instance_id uuid REFERENCES record_instances(id) ON DELETE SET NULL,
  client_uuid               uuid,
  created_by                uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at                timestamptz NOT NULL DEFAULT now(),
  submitted_at              timestamptz,
  synced_at                 timestamptz,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_instances_type_fk
    FOREIGN KEY (record_type_id, company_id)
    REFERENCES record_types (id, company_id) ON DELETE RESTRICT,
  CONSTRAINT record_instances_version_fk
    FOREIGN KEY (record_type_version_id, record_type_id)
    REFERENCES record_type_versions (id, record_type_id) ON DELETE RESTRICT,
  CONSTRAINT record_instances_vessel_fk
    FOREIGN KEY (vessel_id, company_id)
    REFERENCES vessels (id, company_id) ON DELETE RESTRICT,
  CONSTRAINT record_instances_data_is_object CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT record_instances_period_chk
    CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CONSTRAINT record_instances_id_company_key UNIQUE (id, company_id)
);

-- Idempotencia del sync: el dispositivo genera client_uuid al crear el borrador
-- local, así reintentar el envío tras un corte de señal no duplica el registro.
CREATE UNIQUE INDEX record_instances_client_uuid_key
  ON record_instances (company_id, client_uuid) WHERE client_uuid IS NOT NULL;

CREATE INDEX record_instances_type_occurred_idx
  ON record_instances (record_type_id, occurred_at DESC);
CREATE INDEX record_instances_vessel_occurred_idx
  ON record_instances (vessel_id, occurred_at DESC) WHERE vessel_id IS NOT NULL;
CREATE INDEX record_instances_pending_idx
  ON record_instances (company_id, submitted_at) WHERE status = 'pendiente_revision';
CREATE INDEX record_instances_parent_idx
  ON record_instances (parent_record_instance_id) WHERE parent_record_instance_id IS NOT NULL;
CREATE INDEX record_instances_data_gin ON record_instances USING gin (data jsonb_path_ops);

CREATE TRIGGER record_instances_set_updated_at BEFORE UPDATE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON COLUMN record_instances.data IS
  'Valores del formulario según field_schema de la versión referenciada. Los campos '
  'presentes en TODOS los registros (buque, fecha, marea) son columnas propias para '
  'poder filtrar e indexar sin abrir el JSON.';


-- ---------------------------------------------------------------------------
-- Coherencia scope <-> vessel_id, y rol habilitado para crear
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_record_instance_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_scope         text;
  v_rt_status     text;
  v_creators      text[];
  v_user_roles    text[];
BEGIN
  SELECT rt.scope, rt.status INTO v_scope, v_rt_status
  FROM record_types rt WHERE rt.id = NEW.record_type_id;

  IF v_scope = 'vessel' AND NEW.vessel_id IS NULL THEN
    RAISE EXCEPTION 'el tipo de registro es de alcance "vessel": vessel_id es obligatorio'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_scope = 'company' AND NEW.vessel_id IS NOT NULL THEN
    RAISE EXCEPTION 'el tipo de registro es de alcance "company": vessel_id debe ser NULL'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' AND v_rt_status = 'derogado' THEN
    RAISE EXCEPTION 'no se pueden crear registros de un tipo derogado'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Roles habilitados para crear (ej. la NNC solo la emiten ciertos roles).
  IF TG_OP = 'INSERT' THEN
    SELECT rtv.allowed_creator_roles INTO v_creators
    FROM record_type_versions rtv WHERE rtv.id = NEW.record_type_version_id;

    IF array_length(v_creators, 1) > 0 THEN
      v_user_roles := sgs_user_role_codes(NEW.created_by, NEW.occurred_at::date);
      IF NOT (v_user_roles && v_creators) THEN
        RAISE EXCEPTION
          'el usuario % no tiene ninguno de los roles habilitados para crear este registro (%)',
          NEW.created_by, array_to_string(v_creators, ', ')
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER record_instances_validate
  BEFORE INSERT OR UPDATE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_record_instance_validate();


-- ---------------------------------------------------------------------------
-- Validación de data contra field_schema
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_validate_instance_data(p_schema jsonb, p_data jsonb, p_strict boolean)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  fld          jsonb;
  k            text;
  schema_keys  text[] := '{}';
  unknown      text[];
  missing      text[] := '{}';
BEGIN
  FOR fld IN SELECT jsonb_array_elements(p_schema) LOOP
    k := fld ->> 'key';
    schema_keys := schema_keys || k;

    -- p_strict = el registro se está enviando a revisión: los required deben estar.
    IF p_strict AND coalesce((fld ->> 'required')::boolean, false) THEN
      IF NOT (p_data ? k) OR jsonb_typeof(p_data -> k) = 'null'
         OR (jsonb_typeof(p_data -> k) = 'string' AND (p_data ->> k) = '') THEN
        missing := missing || k;
      END IF;
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(dk), '{}') INTO unknown
  FROM jsonb_object_keys(p_data) AS dk
  WHERE NOT (dk = ANY (schema_keys));

  IF array_length(unknown, 1) > 0 THEN
    RAISE EXCEPTION 'data contiene campos que no existen en el field_schema: %',
      array_to_string(unknown, ', ') USING ERRCODE = 'check_violation';
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'faltan campos obligatorios: %',
      array_to_string(missing, ', ') USING ERRCODE = 'not_null_violation';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- Máquina de estados: borrador -> pendiente_revision -> aprobado | observado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_record_instance_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_schema jsonb;
  v_strict boolean;
BEGIN
  SELECT rtv.field_schema INTO v_schema
  FROM record_type_versions rtv WHERE rtv.id = NEW.record_type_version_id;

  IF TG_OP = 'INSERT' THEN
    v_strict := NEW.status <> 'borrador';
    PERFORM sgs_validate_instance_data(v_schema, NEW.data, v_strict);
    IF NEW.status = 'pendiente_revision' AND NEW.submitted_at IS NULL THEN
      NEW.submitted_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- Un registro aprobado es de solo lectura: es la evidencia que se muestra a PNA.
  IF OLD.status = 'aprobado' AND (
       NEW.data      IS DISTINCT FROM OLD.data OR
       NEW.status    IS DISTINCT FROM OLD.status OR
       NEW.occurred_at IS DISTINCT FROM OLD.occurred_at OR
       NEW.vessel_id IS DISTINCT FROM OLD.vessel_id
     ) THEN
    RAISE EXCEPTION 'el registro % está aprobado y no admite modificaciones', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'borrador'           AND NEW.status = 'pendiente_revision') OR
         (OLD.status = 'pendiente_revision' AND NEW.status IN ('aprobado','observado')) OR
         (OLD.status = 'observado'          AND NEW.status IN ('borrador','pendiente_revision'))
       ) THEN
      RAISE EXCEPTION 'transición de estado inválida: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'pendiente_revision' THEN
      NEW.submitted_at := now();
    END IF;
  END IF;

  v_strict := NEW.status <> 'borrador';
  PERFORM sgs_validate_instance_data(v_schema, NEW.data, v_strict);
  RETURN NEW;
END $$;

CREATE TRIGGER record_instances_status_guard
  BEFORE INSERT OR UPDATE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_record_instance_status_guard();

-- Ahora que existe record_instances, se puede blindar el versionado del catálogo.
CREATE TRIGGER record_type_versions_guard
  BEFORE UPDATE ON record_type_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_record_type_version_guard();


-- ---------------------------------------------------------------------------
-- Historial de revisión (tierra). Fuente de verdad, no se pisa.
-- ---------------------------------------------------------------------------
CREATE TABLE record_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_instance_id  uuid NOT NULL REFERENCES record_instances(id) ON DELETE CASCADE,
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reviewer_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision            text NOT NULL CHECK (decision IN ('aprobado','observado')),
  comment             text,
  reviewed_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT record_reviews_comment_required
    CHECK (decision <> 'observado' OR (comment IS NOT NULL AND btrim(comment) <> ''))
);

CREATE INDEX record_reviews_instance_idx ON record_reviews (record_instance_id, reviewed_at DESC);

COMMENT ON CONSTRAINT record_reviews_comment_required ON record_reviews IS
  'Observar sin motivo escrito deja al buque sin saber qué corregir: el comentario es obligatorio.';

-- La revisión es la que mueve el estado de la instancia, no la aplicación.
CREATE OR REPLACE FUNCTION sgs_apply_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status     text;
  v_company    uuid;
  v_reviewers  text[];
  v_roles      text[];
BEGIN
  SELECT ri.status, ri.company_id INTO v_status, v_company
  FROM record_instances ri WHERE ri.id = NEW.record_instance_id FOR UPDATE;

  IF v_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'la revisión pertenece a otra empresa que el registro'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_status <> 'pendiente_revision' THEN
    RAISE EXCEPTION 'solo se puede revisar un registro en estado pendiente_revision (está en "%")',
      v_status USING ERRCODE = 'check_violation';
  END IF;

  SELECT rtv.allowed_reviewer_roles INTO v_reviewers
  FROM record_instances ri
  JOIN record_type_versions rtv ON rtv.id = ri.record_type_version_id
  WHERE ri.id = NEW.record_instance_id;

  IF array_length(v_reviewers, 1) > 0 THEN
    v_roles := sgs_user_role_codes(NEW.reviewer_id, NEW.reviewed_at::date);
    IF NOT (v_roles && v_reviewers) THEN
      RAISE EXCEPTION 'el usuario % no tiene rol habilitado para revisar este registro (%)',
        NEW.reviewer_id, array_to_string(v_reviewers, ', ')
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE record_instances SET status = NEW.decision WHERE id = NEW.record_instance_id;
  RETURN NEW;
END $$;

CREATE TRIGGER record_reviews_apply
  AFTER INSERT ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_apply_review();

-- Append-only.
CREATE OR REPLACE FUNCTION sgs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es append-only: no admite % ', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER record_reviews_append_only
  BEFORE UPDATE OR DELETE ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_append_only();


-- ---------------------------------------------------------------------------
-- Firmas. N por instancia, cada una con su rol en ese acto.
-- ---------------------------------------------------------------------------
CREATE TABLE signatures (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_instance_id   uuid REFERENCES record_instances(id) ON DELETE CASCADE,
  record_review_id     uuid REFERENCES record_reviews(id) ON DELETE CASCADE,
  signer_user_id       uuid REFERENCES users(id) ON DELETE RESTRICT,
  signer_name          text,
  signer_dni           text,
  signer_role          text NOT NULL,   -- "entrega"/"recibe", "mando_saliente", "capitan"...
  field_key            text,            -- signature_block del field_schema al que corresponde
  method               text NOT NULL CHECK (method IN ('canvas','pin')),
  signature_image_url  text,
  signed_at            timestamptz NOT NULL DEFAULT now(),
  device_metadata      jsonb,
  CONSTRAINT signatures_one_target_chk
    CHECK (num_nonnulls(record_instance_id, record_review_id) = 1),
  CONSTRAINT signatures_canvas_needs_image
    CHECK (method <> 'canvas' OR signature_image_url IS NOT NULL),
  CONSTRAINT signatures_pin_needs_user
    CHECK (method <> 'pin' OR signer_user_id IS NOT NULL),
  CONSTRAINT signatures_signer_identified
    CHECK (signer_user_id IS NOT NULL OR (signer_name IS NOT NULL AND btrim(signer_name) <> ''))
);

CREATE INDEX signatures_instance_idx ON signatures (record_instance_id)
  WHERE record_instance_id IS NOT NULL;
CREATE INDEX signatures_review_idx ON signatures (record_review_id)
  WHERE record_review_id IS NOT NULL;
CREATE UNIQUE INDEX signatures_instance_field_key
  ON signatures (record_instance_id, field_key)
  WHERE record_instance_id IS NOT NULL AND field_key IS NOT NULL;

CREATE TRIGGER signatures_append_only
  BEFORE UPDATE OR DELETE ON signatures
  FOR EACH ROW EXECUTE FUNCTION sgs_append_only();

COMMENT ON COLUMN signatures.signer_name IS
  'Firmante sin usuario en la plataforma (ej. personal tercerizado de RO-03D).';
COMMENT ON COLUMN signatures.device_metadata IS
  'Evidencia complementaria (dispositivo, IP, geo). No reemplaza el valor legal de la firma.';
