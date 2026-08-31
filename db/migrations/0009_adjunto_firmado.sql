-- 0009_adjunto_firmado.sql
--
-- La firma digital todavía no está habilitada por disposición de PNA, así que la
-- evidencia válida de un registro es el formulario en papel completado y firmado a
-- mano, escaneado o fotografiado. Los datos cargados en la plataforma corren en
-- paralelo: sirven para operar, reportar y controlar vencimientos, pero el
-- respaldo que se exhibe ante una inspección es el PDF firmado.
--
-- Consecuencia de diseño: un registro que exige respaldo en papel no se puede
-- aprobar sin ese adjunto. Aprobarlo sin él dejaría un registro sin evidencia
-- válida, que es exactamente lo que esta etapa quiere evitar.

-- ---------------------------------------------------------------------------
-- attachments: qué es cada archivo y dónde está guardado
-- ---------------------------------------------------------------------------
ALTER TABLE attachments
  ADD COLUMN kind text NOT NULL DEFAULT 'evidencia'
    CHECK (kind IN ('formulario_firmado','evidencia','comunicacion','otro')),
  ADD COLUMN storage_key text,
  ADD COLUMN mime_type text;

-- file_url servía para archivos ya alojados en algún lado. Ahora la plataforma
-- también guarda archivos propios, referenciados por storage_key.
ALTER TABLE attachments ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE attachments
  ADD CONSTRAINT attachments_ubicacion_chk
    CHECK (num_nonnulls(file_url, storage_key) >= 1);

CREATE UNIQUE INDEX attachments_storage_key_idx
  ON attachments (storage_key) WHERE storage_key IS NOT NULL;
CREATE INDEX attachments_firmados_idx
  ON attachments (record_instance_id) WHERE kind = 'formulario_firmado';

COMMENT ON COLUMN attachments.kind IS
  'formulario_firmado = el papel firmado a mano, escaneado o fotografiado. Es la '
  'evidencia válida mientras PNA no habilite la firma digital.';
COMMENT ON COLUMN attachments.storage_key IS
  'Ruta relativa dentro del almacén de archivos de la plataforma.';

-- ---------------------------------------------------------------------------
-- El catálogo declara qué registros exigen respaldo en papel
-- ---------------------------------------------------------------------------
ALTER TABLE record_type_versions
  ADD COLUMN requires_signed_attachment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN record_type_versions.requires_signed_attachment IS
  'true = no se puede aprobar sin un adjunto kind=formulario_firmado. Se declara '
  'por tipo de registro y por versión, así el día que PNA habilite la firma '
  'digital se apaga desde el catálogo, sin tocar código ni migrar el esquema.';

-- ---------------------------------------------------------------------------
-- Un registro aprobado tampoco cambia sus adjuntos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_attachment_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_instance uuid;
  v_status   text;
BEGIN
  v_instance := coalesce(NEW.record_instance_id, OLD.record_instance_id);
  IF v_instance IS NULL THEN RETURN coalesce(NEW, OLD); END IF;

  SELECT status INTO v_status FROM record_instances WHERE id = v_instance;
  IF v_status = 'aprobado' THEN
    RAISE EXCEPTION
      'el registro está aprobado: sus adjuntos son parte de la evidencia y no se modifican'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER attachments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION sgs_attachment_guard();

CREATE TRIGGER attachments_audit
  AFTER INSERT OR UPDATE OR DELETE ON attachments
  FOR EACH ROW EXECUTE FUNCTION sgs_audit();

-- ---------------------------------------------------------------------------
-- No se aprueba sin el papel firmado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_apply_review() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status     text;
  v_company    uuid;
  v_reviewers  text[];
  v_roles      text[];
  v_requiere   boolean;
  v_adjuntos   integer;
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

  SELECT rtv.allowed_reviewer_roles, rtv.requires_signed_attachment
    INTO v_reviewers, v_requiere
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

  -- Observar un registro sin respaldo es legítimo (justamente, para pedirlo).
  -- Lo que no se puede es aprobarlo.
  IF NEW.decision = 'aprobado' AND v_requiere THEN
    SELECT count(*) INTO v_adjuntos FROM attachments a
     WHERE a.record_instance_id = NEW.record_instance_id
       AND a.kind = 'formulario_firmado';
    IF v_adjuntos = 0 THEN
      RAISE EXCEPTION
        'este registro no se puede aprobar sin adjuntar el formulario en papel firmado (escaneado o fotografiado)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE record_instances SET status = NEW.decision WHERE id = NEW.record_instance_id;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Vista de apoyo: estado del respaldo en papel de cada registro
-- ---------------------------------------------------------------------------
CREATE VIEW v_record_backing WITH (security_invoker = true) AS
SELECT
  ri.id AS record_instance_id,
  ri.company_id,
  ri.status,
  rtv.requires_signed_attachment,
  count(a.id) FILTER (WHERE a.kind = 'formulario_firmado') AS signed_attachments,
  CASE
    WHEN NOT rtv.requires_signed_attachment THEN 'no_requiere'
    WHEN count(a.id) FILTER (WHERE a.kind = 'formulario_firmado') > 0 THEN 'con_respaldo'
    ELSE 'falta_respaldo'
  END AS backing_status
FROM record_instances ri
JOIN record_type_versions rtv ON rtv.id = ri.record_type_version_id
LEFT JOIN attachments a ON a.record_instance_id = ri.id
GROUP BY ri.id, ri.company_id, ri.status, rtv.requires_signed_attachment;

COMMENT ON VIEW v_record_backing IS
  'Qué registros tienen el formulario en papel firmado adjunto y cuáles lo deben.';
