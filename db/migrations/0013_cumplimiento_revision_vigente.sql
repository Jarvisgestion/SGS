-- 0013_cumplimiento_revision_vigente.sql
--
-- v_record_compliance recorría todos los tipos de registro de la empresa, sin
-- mirar a qué revisión del manual pertenecían. Al publicar una revisión nueva
-- —que copia los formularios de la anterior— el tablero de la Persona
-- Designada mostraba cada obligación dos veces, una por revisión.
--
-- El cumplimiento se mide contra el manual que rige hoy. Los registros ya
-- cargados bajo la revisión anterior no se tocan: se siguen leyendo con su
-- formulario congelado.

CREATE OR REPLACE VIEW v_record_compliance AS
WITH vigentes AS (
  SELECT rt.*
    FROM record_types rt
    JOIN procedures p        ON p.id = rt.procedure_id
    JOIN manual_versions mv  ON mv.id = p.manual_version_id
   WHERE rt.status = 'vigente'
     AND mv.status = 'vigente'
),
targets AS (
  -- registros de buque: uno por cada buque activo de la empresa
  SELECT rt.id AS record_type_id, rt.company_id, v.id AS vessel_id, v.name AS vessel_name
  FROM vigentes rt
  JOIN vessels v ON v.company_id = rt.company_id AND v.status <> 'inactivo'
  WHERE rt.scope = 'vessel'
  UNION ALL
  -- registros de compañía: una sola fila
  SELECT rt.id, rt.company_id, NULL::uuid, NULL::text
  FROM vigentes rt
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
JOIN vigentes rt ON rt.id = t.record_type_id
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
  'RA-06C: estado de cumplimiento por tipo de registro y buque, medido contra la revisión vigente del manual.';
