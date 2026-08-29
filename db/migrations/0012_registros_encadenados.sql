-- 0012_registros_encadenados.sql
--
-- Hay registros que obligan a cargar otro: un incendio con heridos exige el
-- acaecimiento médico (RO-07A), uno que necesitó remolque exige el RE-01R. En
-- el catálogo eso se declara con `triggers_record_type` en un campo booleano.
--
-- Hasta acá la app avisaba cuál correspondía, pero nadie controlaba que se
-- cargara. Esta vista lo hace visible: por cada hecho enviado que marcó uno de
-- esos campos y todavía no tiene el registro hijo, una fila.

CREATE OR REPLACE VIEW v_registros_hijos_pendientes AS
SELECT
  ri.id                              AS record_instance_id,
  ri.company_id,
  ri.vessel_id,
  v.name                             AS vessel_name,
  rt.code                            AS record_type_code,
  rt.name                            AS record_type_name,
  ri.occurred_at,
  ri.status,
  f ->> 'key'                        AS field_key,
  f ->> 'label'                      AS field_label,
  f ->> 'triggers_record_type'       AS required_record_type_code,
  destino.id                         AS required_record_type_id,
  destino.name                       AS required_record_type_name
FROM record_instances ri
JOIN record_types rt        ON rt.id = ri.record_type_id
JOIN procedures p           ON p.id = rt.procedure_id
JOIN record_type_versions rtv
  ON rtv.record_type_id = ri.record_type_id AND rtv.version = ri.record_type_version
CROSS JOIN LATERAL jsonb_array_elements(rtv.field_schema) f
LEFT JOIN vessels v         ON v.id = ri.vessel_id
LEFT JOIN LATERAL (
  SELECT rt2.id, rt2.name
    FROM record_types rt2
    JOIN procedures p2 ON p2.id = rt2.procedure_id
   WHERE p2.manual_version_id = p.manual_version_id
     AND rt2.code = f ->> 'triggers_record_type'
     AND rt2.status = 'vigente'
   LIMIT 1
) destino ON true
WHERE f ? 'triggers_record_type'
  -- Un borrador todavía no afirma nada: la obligación nace al enviarlo.
  AND ri.status <> 'borrador'
  AND (ri.data -> (f ->> 'key')) = 'true'::jsonb
  AND NOT EXISTS (
    SELECT 1
      FROM record_instances hijo
     WHERE hijo.parent_record_instance_id = ri.id
       AND hijo.record_type_id = destino.id
  );

COMMENT ON VIEW v_registros_hijos_pendientes IS
  'Hechos ya enviados que, por lo que se marcó en el formulario, exigen cargar otro registro que todavía no existe.';
