-- 0006_views.sql
--
-- security_invoker = true en TODAS las vistas: sin eso una vista corre con los
-- permisos de su dueño (que es dueño de las tablas y por lo tanto saltea RLS), y
-- una empresa terminaría viendo el catálogo y los registros de otra a través de
-- la vista. Requiere PostgreSQL 15 o superior.
-- Vistas de explotación. RA-06C (Monitoreo y Control del SGS) es un meta-registro:
-- se resuelve como reporte calculado, no como tabla de datos nueva.

CREATE OR REPLACE FUNCTION sgs_next_due(
  p_recurrence_type text, p_recurrence_days integer, p_last timestamptz
) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_last IS NULL THEN NULL
    WHEN p_recurrence_type = 'daily'               THEN (p_last + interval '1 day')::date
    WHEN p_recurrence_type = 'monthly'             THEN (p_last + interval '1 month')::date
    WHEN p_recurrence_type = 'fixed_interval_days' THEN (p_last + make_interval(days => p_recurrence_days))::date
    ELSE NULL
  END;
$$;


-- Catálogo vigente aplanado: tipo de registro con su versión actual.
CREATE VIEW v_record_type_current WITH (security_invoker = true) AS
SELECT
  rt.id                      AS record_type_id,
  rt.company_id,
  c.name                     AS company_name,
  mv.revision_number         AS manual_revision,
  mv.status                  AS manual_status,
  p.code                     AS procedure_code,
  p.name                     AS procedure_name,
  rt.code                    AS record_code,
  rt.name                    AS record_name,
  rt.category,
  rt.scope,
  rt.status                  AS record_type_status,
  rtv.id                     AS current_version_id,
  rtv.version                AS current_version,
  rtv.recurrence_type,
  rtv.recurrence_days,
  rtv.signature_requirement,
  rtv.allowed_creator_roles,
  rtv.allowed_reviewer_roles,
  jsonb_array_length(rtv.field_schema) AS field_count,
  rtv.field_schema
FROM record_types rt
JOIN companies  c  ON c.id  = rt.company_id
JOIN procedures p  ON p.id  = rt.procedure_id
JOIN manual_versions mv ON mv.id = p.manual_version_id
LEFT JOIN record_type_versions rtv ON rtv.id = rt.current_version_id;

COMMENT ON VIEW v_record_type_current IS
  'El catálogo tal como lo ve la app: un tipo de registro con su versión vigente.';


-- Estado de vencimiento de certificados (RMGS-05). Derivado, nunca almacenado.
CREATE VIEW v_vessel_certificate_status WITH (security_invoker = true) AS
SELECT
  vc.id,
  vc.company_id,
  vc.vessel_id,
  v.name       AS vessel_name,
  v.matricula,
  ct.code      AS certificate_code,
  ct.name      AS certificate_name,
  vc.certificate_number,
  vc.issued_at,
  vc.expires_at,
  vc.next_renewal_at,
  vc.expires_at - current_date AS days_to_expiry,
  CASE
    WHEN vc.expires_at IS NULL                                       THEN 'sin_vencimiento'
    WHEN vc.expires_at < current_date                                THEN 'vencido'
    WHEN vc.expires_at <= current_date + vc.alert_days_before        THEN 'por_vencer'
    ELSE 'vigente'
  END AS status
FROM vessel_certificates vc
JOIN vessels v ON v.id = vc.vessel_id
JOIN certificate_types ct ON ct.id = vc.certificate_type_id;


-- Última instancia aprobada por tipo de registro y buque.
CREATE VIEW v_last_approved_record WITH (security_invoker = true) AS
SELECT DISTINCT ON (ri.record_type_id, ri.vessel_id)
  ri.record_type_id,
  ri.vessel_id,
  ri.company_id,
  ri.id          AS record_instance_id,
  ri.occurred_at AS last_occurred_at
FROM record_instances ri
WHERE ri.status = 'aprobado'
ORDER BY ri.record_type_id, ri.vessel_id, ri.occurred_at DESC;


-- RA-06C: ¿qué registros con recurrencia fija no tienen una instancia aprobada al día?
CREATE VIEW v_record_compliance WITH (security_invoker = true) AS
WITH expected AS (
  -- Registros de alcance buque: uno esperado por cada buque en servicio.
  SELECT rt.id AS record_type_id, rt.company_id, v.id AS vessel_id, v.name AS vessel_name
  FROM record_types rt
  JOIN record_type_versions rtv ON rtv.id = rt.current_version_id
  JOIN vessels v ON v.company_id = rt.company_id AND v.status <> 'inactivo'
  WHERE rt.scope IN ('vessel','vessel_optional') AND rt.status = 'vigente'
    AND rtv.recurrence_type IN ('daily','monthly','fixed_interval_days')
  UNION ALL
  -- Registros de alcance compañía: uno esperado por empresa.
  SELECT rt.id, rt.company_id, NULL::uuid, NULL::text
  FROM record_types rt
  JOIN record_type_versions rtv ON rtv.id = rt.current_version_id
  WHERE rt.scope = 'company' AND rt.status = 'vigente'
    AND rtv.recurrence_type IN ('daily','monthly','fixed_interval_days')
)
SELECT
  e.company_id,
  e.vessel_id,
  e.vessel_name,
  rtc.procedure_code,
  rtc.record_code,
  rtc.record_name,
  rtc.recurrence_type,
  rtc.recurrence_days,
  la.last_occurred_at,
  la.record_instance_id AS last_record_instance_id,
  sgs_next_due(rtc.recurrence_type, rtc.recurrence_days, la.last_occurred_at) AS next_due_at,
  CASE
    WHEN la.last_occurred_at IS NULL THEN 'sin_registro'
    WHEN sgs_next_due(rtc.recurrence_type, rtc.recurrence_days, la.last_occurred_at) < current_date
      THEN 'vencido'
    WHEN sgs_next_due(rtc.recurrence_type, rtc.recurrence_days, la.last_occurred_at)
         <= current_date + 7 THEN 'por_vencer'
    ELSE 'al_dia'
  END AS compliance_status
FROM expected e
JOIN v_record_type_current rtc ON rtc.record_type_id = e.record_type_id
LEFT JOIN v_last_approved_record la
       ON la.record_type_id = e.record_type_id
      AND la.vessel_id IS NOT DISTINCT FROM e.vessel_id;

COMMENT ON VIEW v_record_compliance IS
  'Sustituye al meta-registro RA-06C: estado de cumplimiento de cada registro con '
  'recurrencia, por buque. No es un formulario a completar, es un cálculo.';


-- Bandeja de la Persona Designada / asesor.
CREATE VIEW v_pending_reviews WITH (security_invoker = true) AS
SELECT
  ri.id AS record_instance_id,
  ri.company_id,
  ri.vessel_id,
  v.name AS vessel_name,
  rtc.record_code,
  rtc.record_name,
  rtc.procedure_code,
  ri.occurred_at,
  ri.submitted_at,
  now() - ri.submitted_at AS waiting_for,
  u.full_name AS submitted_by,
  rtc.allowed_reviewer_roles
FROM record_instances ri
JOIN v_record_type_current rtc ON rtc.record_type_id = ri.record_type_id
JOIN users u ON u.id = ri.created_by
LEFT JOIN vessels v ON v.id = ri.vessel_id
WHERE ri.status = 'pendiente_revision';


-- Trazabilidad completa de una instancia, para exhibir ante una inspección.
CREATE VIEW v_record_trace WITH (security_invoker = true) AS
SELECT
  ri.id AS record_instance_id,
  ri.company_id,
  rtc.record_code,
  ri.status,
  ri.occurred_at,
  ri.created_at,
  ri.submitted_at,
  ri.synced_at,
  creator.full_name AS created_by_name,
  (SELECT count(*) FROM signatures s WHERE s.record_instance_id = ri.id) AS signature_count,
  (SELECT jsonb_agg(jsonb_build_object(
            'decision', rr.decision, 'reviewer', ru.full_name,
            'comment', rr.comment, 'reviewed_at', rr.reviewed_at)
          ORDER BY rr.reviewed_at)
     FROM record_reviews rr JOIN users ru ON ru.id = rr.reviewer_id
    WHERE rr.record_instance_id = ri.id) AS reviews,
  ri.parent_record_instance_id
FROM record_instances ri
JOIN v_record_type_current rtc ON rtc.record_type_id = ri.record_type_id
JOIN users creator ON creator.id = ri.created_by;
