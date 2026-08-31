-- 01_reglas.sql — Verifica que el esquema hace cumplir las reglas del SGS.
-- Requiere el seed cargado. Corre dentro de una transacción que se revierte.
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/01_reglas.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.expect_fail(p_sql text, p_case text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FALLO [%]: se esperaba un error y la sentencia fue aceptada', p_case;
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLO %' THEN RAISE; END IF;
    RAISE NOTICE '  ok  %  (%)', rpad(p_case, 52), left(SQLERRM, 60);
  WHEN others THEN
    RAISE NOTICE '  ok  %  (%)', rpad(p_case, 52), left(SQLERRM, 60);
END $$;

CREATE FUNCTION pg_temp.expect_ok(p_cond boolean, p_case text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT p_cond THEN
    RAISE EXCEPTION 'FALLO [%]: la condición esperada no se cumplió', p_case;
  END IF;
  RAISE NOTICE '  ok  %', p_case;
END $$;


DO $t$
DECLARE
  v_company uuid; v_company_b uuid; v_vessel uuid; v_proc uuid;
  u_pd uuid; u_capitan uuid; u_jm uuid; u_guardia uuid;
  rt_re01d uuid; rtv_re01d uuid; rt_rmgs06 uuid; rtv_rmgs06 uuid;
  rt_ro10c uuid; rtv_ro10c uuid; rt_re01a uuid; rtv_re01a uuid;
  v_new uuid; v_review uuid; v_cnt int; v_status text;
BEGIN
SELECT id INTO v_company FROM companies WHERE name = 'Empresa Demo (catálogo de referencia)';
SELECT id INTO v_vessel  FROM vessels   WHERE company_id = v_company AND matricula = 'MAT-0001';
SELECT id INTO u_pd      FROM users WHERE email = 'pd@demo.local';
SELECT id INTO u_capitan FROM users WHERE email = 'capitan@demo.local';
SELECT id INTO u_jm      FROM users WHERE email = 'jm@demo.local';
SELECT id INTO u_guardia FROM users WHERE email = 'guardia@demo.local';
SELECT id INTO v_proc    FROM procedures WHERE company_id = v_company AND code = 'PE-01';
SELECT id, current_version_id INTO rt_re01d,  rtv_re01d  FROM record_types WHERE company_id=v_company AND code='RE-01D';
SELECT id, current_version_id INTO rt_rmgs06, rtv_rmgs06 FROM record_types WHERE company_id=v_company AND code='RMGS-06';
SELECT id, current_version_id INTO rt_ro10c,  rtv_ro10c  FROM record_types WHERE company_id=v_company AND code='RO-10C';
SELECT id, current_version_id INTO rt_re01a,  rtv_re01a  FROM record_types WHERE company_id=v_company AND code='RE-01A';

RAISE NOTICE '--- Catálogo: validación de field_schema ---';
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, field_schema)
     VALUES (%L,%L,9,'[{"key":"a","type":"inexistente"}]')$q$, rt_re01d, v_company),
  'tipo de campo inexistente en field_schema');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, field_schema)
     VALUES (%L,%L,9,'[{"key":"a","type":"text"},{"key":"a","type":"date"}]')$q$, rt_re01d, v_company),
  'key duplicada en field_schema');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, field_schema)
     VALUES (%L,%L,9,'[{"key":"a","type":"select"}]')$q$, rt_re01d, v_company),
  'select sin options');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, field_schema)
     VALUES (%L,%L,9,'[{"key":"f","type":"signature_block"}]')$q$, rt_re01d, v_company),
  'signature_block sin signer_role');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, field_schema)
     VALUES (%L,%L,9,'[{"key":"t","type":"table","columns":[{"key":"c","type":"table"}]}]')$q$,
  rt_re01d, v_company), 'tabla anidada dentro de tabla');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_type_versions (record_type_id, company_id, version, allowed_creator_roles)
     VALUES (%L,%L,9,ARRAY['rol_que_no_existe'])$q$, rt_re01d, v_company),
  'rol inexistente en allowed_creator_roles');

PERFORM pg_temp.expect_fail(format(
  $q$UPDATE record_type_versions SET field_schema='[]' WHERE id=%L$q$, rtv_re01d),
  'editar el schema de una versión que ya tiene registros');

RAISE NOTICE '--- Instancias: alcance, permisos y estados ---';
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id,
       occurred_at, created_by) VALUES (%L,%L,%L, now(), %L)$q$,
  v_company, rt_re01d, rtv_re01d, u_capitan),
  'registro de alcance buque sin vessel_id');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id,
       vessel_id, occurred_at, created_by) VALUES (%L,%L,%L,%L, now(), %L)$q$,
  v_company, rt_rmgs06, rtv_rmgs06, v_vessel, u_pd),
  'registro de alcance empresa con vessel_id');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id,
       vessel_id, occurred_at, created_by) VALUES (%L,%L,%L,%L, now(), %L)$q$,
  v_company, rt_re01d, rtv_re01d, v_vessel, u_guardia),
  'el guardia no tiene rol para crear un RE-01D');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id,
       vessel_id, occurred_at, created_by, data)
     VALUES (%L,%L,%L,%L, now(), %L, '{"campo_inventado":1}')$q$,
  v_company, rt_re01d, rtv_re01d, v_vessel, u_capitan),
  'data con un campo que no está en el field_schema');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id,
       vessel_id, occurred_at, created_by, data, status)
     VALUES (%L,%L,%L,%L, now(), %L, '{}', 'pendiente_revision')$q$,
  v_company, rt_re01d, rtv_re01d, v_vessel, u_capitan),
  'enviar a revisión sin los campos obligatorios');

-- Flujo feliz completo
INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              occurred_at, created_by, data, status, client_uuid)
VALUES (v_company, rt_ro10c, rtv_ro10c, v_vessel, now(), u_guardia,
        jsonb_build_object('fecha', to_char(current_date,'YYYY-MM-DD'),
                           'amarras_ok', true, 'achique_ok', true, 'acceso_ok', true),
        'borrador', gen_random_uuid())
RETURNING id INTO v_new;
PERFORM pg_temp.expect_ok(true, 'crear borrador con rol habilitado');

PERFORM pg_temp.expect_fail(format(
  $q$UPDATE record_instances SET status='aprobado' WHERE id=%L$q$, v_new),
  'transición borrador -> aprobado (saltea la revisión)');

UPDATE record_instances SET status='pendiente_revision' WHERE id=v_new;
PERFORM pg_temp.expect_ok(
  (SELECT submitted_at IS NOT NULL FROM record_instances WHERE id=v_new),
  'enviar a revisión sella submitted_at automáticamente');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision)
     VALUES (%L,%L,%L,'observado')$q$, v_new, v_company, u_pd),
  'observar sin escribir el motivo');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
     VALUES (%L,%L,%L,'aprobado',NULL)$q$, v_new, v_company, u_jm),
  'revisar sin rol de revisor habilitado');

INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
VALUES (v_new, v_company, u_pd, 'aprobado', 'Conforme.') RETURNING id INTO v_review;
SELECT status INTO v_status FROM record_instances WHERE id=v_new;
PERFORM pg_temp.expect_ok(v_status='aprobado', 'la revisión mueve el estado de la instancia');

PERFORM pg_temp.expect_fail(format(
  $q$UPDATE record_instances SET data='{}' WHERE id=%L$q$, v_new),
  'modificar un registro ya aprobado');

PERFORM pg_temp.expect_fail(format(
  $q$UPDATE record_reviews SET decision='observado' WHERE id=%L$q$, v_review),
  'editar una revisión (append-only)');

PERFORM pg_temp.expect_fail(format(
  $q$DELETE FROM record_reviews WHERE id=%L$q$, v_review),
  'borrar una revisión (append-only)');

PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
     VALUES (%L,%L,%L,'aprobado','otra vez')$q$, v_new, v_company, u_pd),
  'revisar dos veces un registro ya cerrado');

RAISE NOTICE '--- Firmas ---';
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO signatures (company_id, record_instance_id, signer_user_id, signer_role, method)
     VALUES (%L,%L,%L,'capitan','canvas')$q$, v_company, v_new, u_capitan),
  'firma canvas sin imagen');
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO signatures (company_id, record_instance_id, signer_name, signer_role, method)
     VALUES (%L,%L,'Alguien','capitan','pin')$q$, v_company, v_new),
  'firma por PIN sin usuario identificado');
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO signatures (company_id, record_instance_id, signer_role, method, signature_image_url)
     VALUES (%L,%L,'externo','canvas','http://x/f.png')$q$, v_company, v_new),
  'firma sin identificar al firmante');
INSERT INTO signatures (company_id, record_instance_id, signer_name, signer_dni, signer_role,
                        method, signature_image_url)
VALUES (v_company, v_new, 'Contratista Externo', '30111222', 'recibe', 'canvas', 'http://x/f.png');
PERFORM pg_temp.expect_ok(true, 'firma manuscrita de alguien sin usuario (tercerizado)');

RAISE NOTICE '--- Sincronización offline ---';
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
       occurred_at, created_by, data, client_uuid)
     SELECT company_id, record_type_id, record_type_version_id, vessel_id, occurred_at,
            created_by, data, client_uuid FROM record_instances WHERE id=%L$q$, v_new),
  'reenviar el mismo client_uuid duplica el registro');

RAISE NOTICE '--- Roles con vigencia ---';
PERFORM pg_temp.expect_fail(format(
  $q$INSERT INTO user_roles (user_id, role_id, company_id, vessel_id, valid_from)
     SELECT %L, id, %L, %L, current_date - 10 FROM roles WHERE code='capitan'$q$,
  u_capitan, v_company, v_vessel),
  'mismo rol, mismo buque, periodos solapados');

RAISE NOTICE '--- Auditoría ---';
SELECT count(*) INTO v_cnt FROM audit_log
 WHERE entity_type='record_instances' AND entity_id=v_new;
PERFORM pg_temp.expect_ok(v_cnt >= 3,
  format('audit_log registró el ciclo de vida del registro (%s eventos)', v_cnt));
PERFORM pg_temp.expect_fail(
  $q$DELETE FROM audit_log WHERE true$q$, 'borrar la bitácora de auditoría');

RAISE NOTICE '--- Cumplimiento (RA-06C como reporte) ---';
PERFORM pg_temp.expect_ok(
  (SELECT compliance_status='vencido' FROM v_record_compliance
    WHERE record_code='RE-01A' AND vessel_id=v_vessel),
  'RE-01A aprobado hace 40 días con recurrencia 30 figura vencido');
PERFORM pg_temp.expect_ok(
  (SELECT count(*) FROM v_record_compliance WHERE compliance_status='sin_registro') > 0,
  'los registros recurrentes nunca cargados figuran sin_registro');

RAISE NOTICE '--- Aislamiento multi-empresa (RLS) ---';
INSERT INTO companies (name) VALUES ('Otra Armadora S.A.') RETURNING id INTO v_company_b;

SET LOCAL ROLE sgs_app;
PERFORM set_config('sgs.current_company_id', '', true);
SELECT count(*) INTO v_cnt FROM record_instances;
PERFORM pg_temp.expect_ok(v_cnt = 0, 'sin company_id en sesión, sgs_app no ve ningún registro');

PERFORM set_config('sgs.current_company_id', v_company_b::text, true);
SELECT count(*) INTO v_cnt FROM record_instances;
PERFORM pg_temp.expect_ok(v_cnt = 0, 'la empresa B no ve los registros de la empresa A');
SELECT count(*) INTO v_cnt FROM v_record_type_current;
PERFORM pg_temp.expect_ok(v_cnt = 0, 'la empresa B tampoco ve el catálogo de la A');

PERFORM set_config('sgs.current_company_id', v_company::text, true);
SELECT count(*) INTO v_cnt FROM record_instances;
PERFORM pg_temp.expect_ok(v_cnt > 0, 'la empresa A sí ve los suyos');
SELECT count(*) INTO v_cnt FROM v_record_type_current;
PERFORM pg_temp.expect_ok(v_cnt = 44, format('la empresa A ve sus 44 tipos de registro (%s)', v_cnt));
RESET ROLE;

RAISE NOTICE '';
RAISE NOTICE '=== TODOS LOS CASOS PASARON ===';
END $t$;

ROLLBACK;
