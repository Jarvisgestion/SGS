-- 0007_views.sql
-- Vistas de control. RA-06C (Monitoreo y Control del SGS) y RMGS-05 se resuelven
-- acá: son reportes sobre el estado de otros registros, no datos nuevos.

-- ---------------------------------------------------------------------------
-- Próximo vencimiento de un registro recurrente a partir de su última instancia
-- aprobada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_next_due_at(rt_recurrence recurrence_type,
                                           rt_days integer,
                                           last_at timestamptz)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE rt_recurrence
    WHEN 'daily'               THEN (last_at::date + 1)
    WHEN 'monthly'             THEN (last_at::date + interval '1 month')::date
    WHEN 'fixed_interval_days' THEN (last_at::date + rt_days)
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- v_record_compliance
--
-- Una fila por (tipo de registro recurrente x buque aplicable) con la última
-- instancia aprobada y su vencimiento. Es la base del tablero de la Persona
-- Designada y del RA-06C.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_record_compliance AS
WITH targets AS (
  -- registros de buque: uno por cada buque activo de la empresa
  SELECT rt.id AS record_type_id, rt.company_id, v.id AS vessel_id, v.name AS vessel_name
  FROM record_types rt
  JOIN vessels v ON v.company_id = rt.company_id AND v.status <> 'inactivo'
  WHERE rt.scope = 'vessel'
  UNION ALL
  -- registros de compañía: una sola fila
  SELECT rt.id, rt.company_id, NULL::uuid, NULL::text
  FROM record_types rt
  WHERE rt.scope = 'company'
)
SELECT
  t.company_id,
  t.vessel_id,
  t.vessel_name,
  rt.id            AS record_type_id,
  rt.code          AS record_type_code,
  rt.name          AS record_type_name,
  rt.category,
  rt.recurrence_type,
  rt.recurrence_days,
  last_ok.id       AS last_approved_instance_id,
  last_ok.occurred_at AS last_approved_at,
  sgs_next_due_at(rt.recurrence_type, rt.recurrence_days, last_ok.occurred_at) AS next_due_at,
  pend.pending_count,
  CASE
    WHEN rt.recurrence_type = 'on_event' THEN 'no_aplica'
    WHEN last_ok.occurred_at IS NULL     THEN 'sin_registro'
    WHEN sgs_next_due_at(rt.recurrence_type, rt.recurrence_days, last_ok.occurred_at) < current_date
                                         THEN 'vencido'
    WHEN sgs_next_due_at(rt.recurrence_type, rt.recurrence_days, last_ok.occurred_at)
         <= current_date + 7             THEN 'por_vencer'
    ELSE 'al_dia'
  END AS compliance_status
FROM targets t
JOIN record_types rt ON rt.id = t.record_type_id AND rt.status = 'vigente'
LEFT JOIN LATERAL (
  SELECT ri.id, ri.occurred_at
  FROM record_instances ri
  WHERE ri.record_type_id = t.record_type_id
    AND ri.status = 'aprobado'
    AND (t.vessel_id IS NULL OR ri.vessel_id = t.vessel_id)
  ORDER BY ri.occurred_at DESC
  LIMIT 1
) last_ok ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS pending_count
  FROM record_instances ri
  WHERE ri.record_type_id = t.record_type_id
    AND ri.status IN ('pendiente_revision', 'observado')
    AND (t.vessel_id IS NULL OR ri.vessel_id = t.vessel_id)
) pend ON true;

COMMENT ON VIEW v_record_compliance IS
  'RA-06C: estado de cumplimiento por tipo de registro y buque (último aprobado, vencimiento, pendientes).';

-- ---------------------------------------------------------------------------
-- v_vessel_certificate_status  (RMGS-05, alertas de vencimiento)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_vessel_certificate_status AS
SELECT
  vc.id,
  vc.company_id,
  vc.vessel_id,
  v.name AS vessel_name,
  vc.certificate_label,
  vc.certificate_number,
  vc.expires_at,
  vc.next_renewal_at,
  certificate_status_at(vc.expires_at) AS status,
  vc.expires_at - current_date         AS days_to_expiry
FROM vessel_certificates vc
JOIN vessels v ON v.id = vc.vessel_id;

-- ---------------------------------------------------------------------------
-- v_pending_reviews  (bandeja de la Persona Designada / asesor externo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_pending_reviews AS
SELECT
  ri.id,
  ri.company_id,
  ri.vessel_id,
  v.name  AS vessel_name,
  rt.code AS record_type_code,
  rt.name AS record_type_name,
  ri.status,
  ri.occurred_at,
  ri.submitted_at,
  u.full_name AS created_by_name,
  now() - ri.submitted_at AS waiting_for
FROM record_instances ri
JOIN record_types rt ON rt.id = ri.record_type_id
LEFT JOIN vessels v  ON v.id = ri.vessel_id
LEFT JOIN users u    ON u.id = ri.created_by
WHERE ri.status = 'pendiente_revision';

-- ---------------------------------------------------------------------------
-- v_record_instance_signatures
--
-- Cruza los signature_block declarados en la versión congelada del formulario
-- contra las firmas efectivamente registradas: muestra qué falta firmar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_record_instance_signatures AS
SELECT
  ri.id AS record_instance_id,
  ri.company_id,
  f ->> 'key'         AS field_key,
  f ->> 'signer_role' AS required_signer_role,
  s.id                AS signature_id,
  s.signer_name,
  s.method,
  s.signed_at,
  (s.id IS NOT NULL)  AS is_signed
FROM record_instances ri
JOIN record_type_versions rtv
  ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
CROSS JOIN LATERAL jsonb_array_elements(rtv.field_schema) f
LEFT JOIN signatures s
  ON s.record_instance_id = ri.id AND s.field_key = f ->> 'key'
WHERE f ->> 'type' = 'signature_block';

-- ---------------------------------------------------------------------------
-- v_record_nonconformities
--
-- Desvíos detectados en checklists (ítems no_ok). Es lo que alimenta el
-- "Anexo de desvíos" de PO-05 sin necesidad de una tabla aparte.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_record_nonconformities AS
SELECT
  ri.id AS record_instance_id,
  ri.company_id,
  ri.vessel_id,
  rt.code AS record_type_code,
  ri.occurred_at,
  f ->> 'key'   AS field_key,
  f ->> 'label' AS field_label,
  item ->> 'item'        AS item,
  item ->> 'observacion' AS observacion
FROM record_instances ri
JOIN record_types rt ON rt.id = ri.record_type_id
JOIN record_type_versions rtv
  ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
CROSS JOIN LATERAL jsonb_array_elements(rtv.field_schema) f
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(ri.data -> (f ->> 'key'), '[]'::jsonb)) item
WHERE f ->> 'type' = 'checklist'
  AND item ->> 'status' = 'no_ok';
