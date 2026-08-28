-- 0006_risk_audit.sql
-- Matriz de riesgo (PO-08 / RO-08) y bitácora de auditoría.

CREATE TYPE risk_status AS ENUM ('vigente', 'revisado', 'cerrado');

-- ---------------------------------------------------------------------------
-- risk_assessments
--
-- Tabla propia (y no un record_type más) porque otros registros la
-- REFERENCIAN: RO-07A cita "Cuadro N°X" de la matriz de PO-08.
-- La matriz maestra y la evaluación puntual (RO-08) comparten tabla: la
-- diferencia es si nace de un record_instance (source_record_instance_id) o no.
-- ---------------------------------------------------------------------------
CREATE TABLE risk_assessments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  vessel_id      uuid,                      -- NULL = riesgo genérico de la compañía
  chart_number   text,                      -- "Cuadro N° 7" del anexo de PO-08
  work_position  text NOT NULL,             -- "Capitán", "Cocinero", ...
  hazard_source  text NOT NULL,
  probability    smallint NOT NULL,
  consequence    smallint NOT NULL,
  risk_score     smallint GENERATED ALWAYS AS (probability * consequence) STORED,
  control_measures    text,
  responsible_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  due_date            date,
  residual_probability smallint,
  residual_consequence smallint,
  residual_score  smallint GENERATED ALWAYS AS (residual_probability * residual_consequence) STORED,
  source_record_instance_id uuid REFERENCES record_instances (id) ON DELETE SET NULL,
  status         risk_status NOT NULL DEFAULT 'vigente',
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT risk_assessments_scale CHECK (
    probability BETWEEN 1 AND 3 AND consequence BETWEEN 1 AND 3
    AND (residual_probability IS NULL OR residual_probability BETWEEN 1 AND 3)
    AND (residual_consequence IS NULL OR residual_consequence BETWEEN 1 AND 3)
  ),
  CONSTRAINT risk_assessments_id_company_key UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX risk_assessments_chart_key
  ON risk_assessments (company_id, chart_number) WHERE chart_number IS NOT NULL;
CREATE INDEX risk_assessments_company_idx ON risk_assessments (company_id, status);
CREATE TRIGGER risk_assessments_set_updated_at BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- Nivel de riesgo derivado (bajo/medio/alto) sobre la escala 1-3 x 1-3.
CREATE OR REPLACE FUNCTION risk_level(score smallint)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN score IS NULL THEN NULL
    WHEN score <= 2 THEN 'bajo'
    WHEN score <= 4 THEN 'medio'
    ELSE 'alto'
  END;
$$;

-- ---------------------------------------------------------------------------
-- audit_log  (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id    uuid,
  entity_type   text NOT NULL,             -- record_instance | record_review | vessel_certificate | ...
  entity_id     uuid NOT NULL,
  action        text NOT NULL,             -- created | updated | status_changed | signed | synced
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_log_action_known
    CHECK (action IN ('created', 'updated', 'status_changed', 'signed', 'reviewed', 'synced', 'deleted'))
);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_company_idx ON audit_log (company_id, occurred_at DESC);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION sgs_forbid_mutation();

-- ---------------------------------------------------------------------------
-- Auditoría automática de las entidades sensibles.
--
-- Se registra en la base y no sólo en el backend para que ninguna vía de
-- escritura (script, migración, consola) quede fuera de la traza.
-- `sgs.actor_user_id` es una variable de sesión que el backend setea por
-- request (SET LOCAL sgs.actor_user_id = '...').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_current_actor() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
DECLARE v text;
BEGIN
  v := current_setting('sgs.actor_user_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION sgs_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  act      text;
  meta     jsonb := '{}'::jsonb;
  actor    uuid;
  entity   text := TG_ARGV[0];
  row_json jsonb;
BEGIN
  row_json := to_jsonb(COALESCE(NEW, OLD));
  actor := sgs_current_actor();

  IF TG_OP = 'INSERT' THEN
    act := 'created';
    IF entity = 'record_instance' THEN
      actor := COALESCE(actor, NEW.created_by);
      meta := jsonb_build_object('status', NEW.status);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    act := 'updated';
    IF entity = 'record_instance' AND NEW.status IS DISTINCT FROM OLD.status THEN
      act  := 'status_changed';
      meta := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    ELSE
      SELECT jsonb_object_agg(key, jsonb_build_object('from', to_jsonb(OLD) -> key, 'to', value))
        INTO meta
      FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(OLD) -> key IS DISTINCT FROM value
        AND key <> 'updated_at';
      meta := COALESCE(meta, '{}'::jsonb);
    END IF;
  ELSE
    act := 'deleted';
  END IF;

  INSERT INTO audit_log (company_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES (
    (row_json ->> 'company_id')::uuid,
    entity,
    (row_json ->> 'id')::uuid,
    act,
    actor,
    meta
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER record_instances_audit AFTER INSERT OR UPDATE OR DELETE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_audit('record_instance');
CREATE TRIGGER vessel_certificates_audit AFTER INSERT OR UPDATE OR DELETE ON vessel_certificates
  FOR EACH ROW EXECUTE FUNCTION sgs_audit('vessel_certificate');
CREATE TRIGGER record_types_audit AFTER INSERT OR UPDATE OR DELETE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_audit('record_type');
CREATE TRIGGER risk_assessments_audit AFTER INSERT OR UPDATE OR DELETE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION sgs_audit('risk_assessment');

-- record_reviews y signatures no tienen company_id propio: se resuelve por la
-- instancia asociada.
CREATE OR REPLACE FUNCTION sgs_audit_child() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cid      uuid;
  entity   text := TG_ARGV[0];
  act      text := TG_ARGV[1];
  row_json jsonb := to_jsonb(NEW);
  inst     uuid := (row_json ->> 'record_instance_id')::uuid;
BEGIN
  SELECT company_id INTO cid FROM record_instances WHERE id = inst;

  INSERT INTO audit_log (company_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES (
    cid, entity, (row_json ->> 'id')::uuid, act,
    COALESCE(sgs_current_actor(),
             (row_json ->> 'reviewer_id')::uuid,
             (row_json ->> 'signer_user_id')::uuid),
    CASE entity
      WHEN 'record_review' THEN jsonb_build_object('decision', row_json ->> 'decision',
                                                   'record_instance_id', inst)
      ELSE jsonb_build_object('signer_role', row_json ->> 'signer_role',
                              'method', row_json ->> 'method',
                              'record_instance_id', inst)
    END);
  RETURN NULL;
END;
$$;

CREATE TRIGGER record_reviews_audit AFTER INSERT ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_audit_child('record_review', 'reviewed');
CREATE TRIGGER signatures_audit AFTER INSERT ON signatures
  FOR EACH ROW WHEN (NEW.record_instance_id IS NOT NULL)
  EXECUTE FUNCTION sgs_audit_child('signature', 'signed');
