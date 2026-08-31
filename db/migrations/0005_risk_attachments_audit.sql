-- 0005_risk_attachments_audit.sql
-- Adjuntos, matriz de riesgo (PO-08) y bitácora de auditoría.

CREATE TABLE attachments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_instance_id    uuid REFERENCES record_instances(id) ON DELETE CASCADE,
  vessel_certificate_id uuid REFERENCES vessel_certificates(id) ON DELETE CASCADE,
  manual_version_id     uuid REFERENCES manual_versions(id) ON DELETE CASCADE,
  file_url              text NOT NULL,
  file_name             text,
  file_type             text NOT NULL DEFAULT 'other'
                          CHECK (file_type IN ('pdf','image','email','other')),
  byte_size             bigint CHECK (byte_size >= 0),
  checksum_sha256       text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_one_target_chk CHECK (
    num_nonnulls(record_instance_id, vessel_certificate_id, manual_version_id) <= 1)
);

CREATE INDEX attachments_instance_idx ON attachments (record_instance_id)
  WHERE record_instance_id IS NOT NULL;

ALTER TABLE manual_versions
  ADD CONSTRAINT manual_versions_source_attachment_fk
  FOREIGN KEY (source_attachment_id) REFERENCES attachments(id) ON DELETE SET NULL;

ALTER TABLE vessel_certificates
  ADD COLUMN attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL;

COMMENT ON TABLE attachments IS
  'Cubre "se adjuntará la comunicación realizada, pudiendo ser copia de mail" (PE-01), '
  'el certificado escaneado y el PDF del manual original.';


-- ---------------------------------------------------------------------------
-- Matriz de riesgo (PO-08). Tabla propia porque OTROS registros la referencian.
-- ---------------------------------------------------------------------------
CREATE TABLE risk_assessments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vessel_id                 uuid,
  code                      text,            -- "Cuadro N° 3", como lo cita RO-07A
  work_position             text NOT NULL,
  hazard_source             text NOT NULL,
  risk_factor               text,
  probability               smallint NOT NULL CHECK (probability BETWEEN 1 AND 3),
  consequence               smallint NOT NULL CHECK (consequence BETWEEN 1 AND 3),
  risk_score                smallint GENERATED ALWAYS AS (probability * consequence) STORED,
  control_measures          text,
  responsible_user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date                  date,
  residual_probability      smallint CHECK (residual_probability BETWEEN 1 AND 3),
  residual_consequence      smallint CHECK (residual_consequence BETWEEN 1 AND 3),
  residual_score            smallint GENERATED ALWAYS AS
                              (residual_probability * residual_consequence) STORED,
  is_master                 boolean NOT NULL DEFAULT true,
  origin_record_instance_id uuid REFERENCES record_instances(id) ON DELETE SET NULL,
  version                   integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status                    text NOT NULL DEFAULT 'vigente'
                              CHECK (status IN ('vigente','revisado','derogado')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessments_vessel_fk
    FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT risk_assessments_id_company_key UNIQUE (id, company_id),
  -- El maestro (Anexo PO-08) es genérico; la instancia (RO-08) nace de un hecho.
  CONSTRAINT risk_assessments_master_chk
    CHECK (NOT is_master OR origin_record_instance_id IS NULL)
);

CREATE UNIQUE INDEX risk_assessments_company_code_key
  ON risk_assessments (company_id, code, version) WHERE code IS NOT NULL;
CREATE INDEX risk_assessments_company_status_idx ON risk_assessments (company_id, status);
CREATE TRIGGER risk_assessments_set_updated_at BEFORE UPDATE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON COLUMN risk_assessments.is_master IS
  'true = cuadro de la matriz maestra (Anexo PO-08). false = análisis puntual (RO-08).';


-- ---------------------------------------------------------------------------
-- Bitácora append-only: quién cargó, cuándo, quién corroboró, cuándo.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id     uuid,
  entity_type    text NOT NULL,
  entity_id      uuid NOT NULL,
  action         text NOT NULL CHECK (action IN (
                   'created','updated','status_changed','signed','synced','reviewed','deleted')),
  actor_user_id  uuid,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX audit_log_entity_idx  ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_company_idx ON audit_log (company_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx   ON audit_log (actor_user_id, occurred_at DESC);

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION sgs_append_only();


-- Trigger genérico de auditoría. Guarda solo las columnas que cambiaron.
CREATE OR REPLACE FUNCTION sgs_audit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_action     text;
  v_company    uuid;
  v_entity_id  uuid;
  v_meta       jsonb := '{}'::jsonb;
  v_old        jsonb;
  v_new        jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_action := CASE
                  WHEN TG_TABLE_NAME = 'record_reviews' THEN 'reviewed'
                  WHEN TG_TABLE_NAME = 'signatures'     THEN 'signed'
                  ELSE 'created'
                END;
    v_meta := jsonb_build_object('new', v_new);
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_action := CASE WHEN v_old ? 'status' AND (v_old ->> 'status') IS DISTINCT FROM (v_new ->> 'status')
                     THEN 'status_changed' ELSE 'updated' END;
    SELECT jsonb_object_agg(key, jsonb_build_object('de', v_old -> key, 'a', v_new -> key))
      INTO v_meta
    FROM jsonb_each(v_new)
    WHERE v_new -> key IS DISTINCT FROM v_old -> key
      AND key <> 'updated_at';
    v_meta := jsonb_build_object('cambios', coalesce(v_meta, '{}'::jsonb));
  ELSE
    v_old := to_jsonb(OLD);
    v_action := 'deleted';
    v_meta := jsonb_build_object('old', v_old);
  END IF;

  v_entity_id := coalesce((v_new ->> 'id'), (v_old ->> 'id'))::uuid;
  v_company   := nullif(coalesce((v_new ->> 'company_id'), (v_old ->> 'company_id')), '')::uuid;

  INSERT INTO audit_log (company_id, entity_type, entity_id, action, actor_user_id, metadata)
  VALUES (v_company, TG_TABLE_NAME, v_entity_id, v_action, sgs_current_user_id(), v_meta);

  RETURN NULL;
END $$;

CREATE TRIGGER record_instances_audit AFTER INSERT OR UPDATE OR DELETE ON record_instances
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
CREATE TRIGGER record_reviews_audit AFTER INSERT ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
CREATE TRIGGER signatures_audit AFTER INSERT ON signatures
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
CREATE TRIGGER vessel_certificates_audit AFTER INSERT OR UPDATE OR DELETE ON vessel_certificates
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
CREATE TRIGGER record_type_versions_audit AFTER INSERT OR UPDATE ON record_type_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
CREATE TRIGGER risk_assessments_audit AFTER INSERT OR UPDATE OR DELETE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();
