-- 02_demo_operacion.sql
-- Dataset operativo mínimo sobre el catálogo de referencia: un buque, la dotación,
-- certificados con vencimientos variados y registros recorriendo el flujo completo
-- borrador -> pendiente_revision -> aprobado / observado.
-- Sirve para probar vistas y permisos sin datos reales de ninguna empresa.

BEGIN;

DO $seed$
DECLARE
  v_company  uuid;
  v_vessel   uuid;
  u_pd       uuid;
  u_capitan  uuid;
  u_jm       uuid;
  u_guardia  uuid;
  ct_seg     uuid;
  ct_arq     uuid;
  ct_rad     uuid;
  rt_re01a   uuid; rtv_re01a uuid;
  rt_re01d   uuid; rtv_re01d uuid;
  rt_ro07a   uuid; rtv_ro07a uuid;
  rt_rm04b   uuid; rtv_rm04b uuid;
  rt_ro10c   uuid; rtv_ro10c uuid;
  ri_zafa    uuid; ri_incendio uuid; ri_medico uuid; ri_pedido uuid; ri_guardia uuid;
BEGIN

SELECT id INTO v_company FROM companies WHERE name = 'Empresa Demo (catálogo de referencia)';
IF v_company IS NULL THEN
  RAISE EXCEPTION 'Cargá primero db/seed/01_catalogo_referencia.sql';
END IF;

INSERT INTO vessels (company_id, name, matricula, vessel_type, service,
                     specific_operation, specs, status)
VALUES (v_company, 'Demo I', 'MAT-0001', 'buque motor', 'pesquero', 'arrastrero',
        '{"eslora_m": 52.4, "manga_m": 9.8, "puntal_m": 5.2, "trn": 480,
          "motor": "MAK 8M20", "potencia_hp": 1800, "tripulacion_max": 24}'::jsonb,
        'activo')
RETURNING id INTO v_vessel;

INSERT INTO users (company_id, full_name, dni, email, status) VALUES
  (v_company, 'Ana Ferreyra',  '20111222', 'pd@demo.local',      'activo'),
  (v_company, 'Luis Ocampo',   '20333444', 'capitan@demo.local', 'activo'),
  (v_company, 'Marta Ledesma', '20555666', 'jm@demo.local',      'activo'),
  (v_company, 'Julio Paz',     '20777888', 'guardia@demo.local', 'activo');

SELECT id INTO u_pd      FROM users WHERE email = 'pd@demo.local';
SELECT id INTO u_capitan FROM users WHERE email = 'capitan@demo.local';
SELECT id INTO u_jm      FROM users WHERE email = 'jm@demo.local';
SELECT id INTO u_guardia FROM users WHERE email = 'guardia@demo.local';

INSERT INTO user_roles (user_id, role_id, company_id, vessel_id, valid_from)
SELECT u_pd, id, v_company, NULL, current_date - 400 FROM roles WHERE code = 'persona_designada';
INSERT INTO user_roles (user_id, role_id, company_id, vessel_id, valid_from)
SELECT u_capitan, id, v_company, v_vessel, current_date - 400 FROM roles WHERE code = 'capitan';
INSERT INTO user_roles (user_id, role_id, company_id, vessel_id, valid_from)
SELECT u_jm, id, v_company, v_vessel, current_date - 400 FROM roles WHERE code = 'jefe_maquinas';
INSERT INTO user_roles (user_id, role_id, company_id, vessel_id, valid_from)
SELECT u_guardia, id, v_company, v_vessel, current_date - 400 FROM roles WHERE code = 'guardia_puerto';

-- Certificados: uno vigente, uno por vencer, uno vencido.
INSERT INTO certificate_types (company_id, code, name, issuing_authority, default_validity_months)
VALUES (NULL, 'CERT_SEG', 'Certificado de Seguridad de la Navegación', 'PNA', 12),
       (NULL, 'CERT_ARQ', 'Certificado de Arqueo',                     'PNA', 60),
       (NULL, 'CERT_RAD', 'Certificado de Radio',                      'ENACOM', 12)
ON CONFLICT DO NOTHING;

SELECT id INTO ct_seg FROM certificate_types WHERE code = 'CERT_SEG';
SELECT id INTO ct_arq FROM certificate_types WHERE code = 'CERT_ARQ';
SELECT id INTO ct_rad FROM certificate_types WHERE code = 'CERT_RAD';

INSERT INTO vessel_certificates (company_id, vessel_id, certificate_type_id,
                                 certificate_number, issued_at, expires_at, next_renewal_at)
VALUES
  (v_company, v_vessel, ct_seg, 'SEG-1001', current_date - 300, current_date + 65,  current_date + 35),
  (v_company, v_vessel, ct_rad, 'RAD-2002', current_date - 350, current_date + 15,  current_date + 5),
  (v_company, v_vessel, ct_arq, 'ARQ-3003', current_date - 800, current_date - 20,  current_date - 20);

-- Matriz de riesgo maestra (Anexo PO-08).
INSERT INTO risk_assessments (company_id, vessel_id, code, work_position, hazard_source,
                              risk_factor, probability, consequence, control_measures,
                              responsible_user_id, residual_probability, residual_consequence)
VALUES
  (v_company, NULL, 'Cuadro 01', 'Cubierta', 'Maniobra de red con mar formado',
   'Golpes y atrapamiento', 3, 3, 'Uso de EPP, prohibición de circular bajo la carga', u_pd, 2, 2),
  (v_company, NULL, 'Cuadro 02', 'Máquinas', 'Superficies calientes en sala de máquinas',
   'Quemaduras', 2, 2, 'Aislación térmica y guantes', u_pd, 1, 2);

-- Referencias del catálogo
SELECT rt.id, rt.current_version_id INTO rt_re01a, rtv_re01a
  FROM record_types rt WHERE rt.company_id = v_company AND rt.code = 'RE-01A';
SELECT rt.id, rt.current_version_id INTO rt_re01d, rtv_re01d
  FROM record_types rt WHERE rt.company_id = v_company AND rt.code = 'RE-01D';
SELECT rt.id, rt.current_version_id INTO rt_ro07a, rtv_ro07a
  FROM record_types rt WHERE rt.company_id = v_company AND rt.code = 'RO-07A';
SELECT rt.id, rt.current_version_id INTO rt_rm04b, rtv_rm04b
  FROM record_types rt WHERE rt.company_id = v_company AND rt.code = 'RM-04B';
SELECT rt.id, rt.current_version_id INTO rt_ro10c, rtv_ro10c
  FROM record_types rt WHERE rt.company_id = v_company AND rt.code = 'RO-10C';

PERFORM set_config('sgs.current_user_id', u_capitan::text, true);

-- 1) Zafarrancho aprobado hace 40 días: con recurrencia de 30 queda VENCIDO.
INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              marea, occurred_at, data, status, created_by, synced_at)
VALUES (v_company, rt_re01a, rtv_re01a, v_vessel, 'M-114', now() - interval '40 days',
        jsonb_build_object(
          'tipo_ejercicio','Incendio',
          'tema_tratado','Ejercicio de lucha contra incendio en sala de máquinas',
          'duracion_min', 45,
          'asistentes', jsonb_build_array(
            jsonb_build_object('nombre','Luis Ocampo','dni','20333444','puesto','Capitán'),
            jsonb_build_object('nombre','Marta Ledesma','dni','20555666','puesto','Jefe de Máquinas')),
          'observaciones','Sin novedad'),
        'pendiente_revision', u_capitan, now() - interval '40 days')
RETURNING id INTO ri_zafa;

INSERT INTO signatures (company_id, record_instance_id, signer_user_id, signer_role,
                        field_key, method)
VALUES (v_company, ri_zafa, u_capitan, 'capitan', 'firma_capitan', 'pin');

INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment, reviewed_at)
VALUES (ri_zafa, v_company, u_pd, 'aprobado', 'Conforme.', now() - interval '39 days');

-- 2) Incendio con heridos -> dispara un RO-07A enlazado (parent_record_instance_id).
INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              marea, occurred_at, data, status, created_by, synced_at)
VALUES (v_company, rt_re01d, rtv_re01d, v_vessel, 'M-115', now() - interval '6 days',
        jsonb_build_object(
          'descripcion','Principio de incendio en tablero eléctrico de proa',
          'lugar_inicio','Pañol de proa',
          'condiciones_meteo','Viento SO 25 nudos, mar 2 m',
          'medidas_preventivas', jsonb_build_array('Corte suministro eléctrico','Cierre de ventilación'),
          'elementos_usados', jsonb_build_array('Extintores','E.R.A'),
          'informa_compania', true, 'informa_pna', true,
          'hubo_heridos', true, 'necesita_remolque', false),
        'pendiente_revision', u_capitan, now() - interval '6 days')
RETURNING id INTO ri_incendio;

INSERT INTO signatures (company_id, record_instance_id, signer_user_id, signer_role,
                        field_key, method)
VALUES (v_company, ri_incendio, u_capitan, 'capitan', 'firma_capitan', 'pin');

INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              marea, occurred_at, data, status, created_by,
                              parent_record_instance_id, synced_at)
VALUES (v_company, rt_ro07a, rtv_ro07a, v_vessel, 'M-115', now() - interval '6 days',
        jsonb_build_object(
          'tripulante_nombre','Marta Ledesma',
          'puesto','Jefe de Máquinas',
          'fecha_hecho', to_char(now() - interval '6 days', 'YYYY-MM-DD"T"HH24:MI'),
          'descripcion','Quemadura leve en antebrazo durante la extinción',
          'sintomas','Eritema, sin ampollas',
          'informa_compania', true, 'informa_pna', false,
          'medidas_correctivas', jsonb_build_array(
            jsonb_build_object('medida','Revisar aislación del tablero',
                               'responsable','Técnica',
                               'plazo', to_char(current_date + 15,'YYYY-MM-DD')))),
        'pendiente_revision', u_capitan, ri_incendio, now() - interval '6 days')
RETURNING id INTO ri_medico;

-- El PD observa el registro médico: vuelve al buque con el motivo.
INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
VALUES (ri_medico, v_company, u_pd, 'observado',
        'Falta indicar si se dio intervención al servicio médico en puerto.');

-- 3) Pedido de materiales del Jefe de Máquinas, todavía en borrador a bordo.
PERFORM set_config('sgs.current_user_id', u_jm::text, true);
INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              marea, occurred_at, data, status, created_by, client_uuid)
VALUES (v_company, rt_rm04b, rtv_rm04b, v_vessel, 'M-116', now() - interval '2 hours',
        jsonb_build_object(
          'marea','M-116', 'sector','Máquina',
          'items', jsonb_build_array(
            jsonb_build_object('cantidad_pedida',4,'urgencia','Urgente',
                               'descripcion','Filtro de aceite MAK 8M20','cantidad_recibida',null),
            jsonb_build_object('cantidad_pedida',20,'urgencia','Normal',
                               'descripcion','Trapo industrial (kg)','cantidad_recibida',null))),
        'borrador', u_jm, gen_random_uuid())
RETURNING id INTO ri_pedido;

-- 4) Verificación diaria de buque en puerto, aprobada ayer.
PERFORM set_config('sgs.current_user_id', u_guardia::text, true);
INSERT INTO record_instances (company_id, record_type_id, record_type_version_id, vessel_id,
                              occurred_at, data, status, created_by, synced_at)
VALUES (v_company, rt_ro10c, rtv_ro10c, v_vessel, now() - interval '1 day',
        jsonb_build_object(
          'fecha', to_char(current_date - 1,'YYYY-MM-DD'),
          'amarras_ok', true, 'achique_ok', true, 'acceso_ok', true,
          'novedades','Sin novedad'),
        'pendiente_revision', u_guardia, now() - interval '1 day')
RETURNING id INTO ri_guardia;

INSERT INTO signatures (company_id, record_instance_id, signer_user_id, signer_role,
                        field_key, method)
VALUES (v_company, ri_guardia, u_guardia, 'guardia_puerto', 'firma_guardia', 'pin');

INSERT INTO record_reviews (record_instance_id, company_id, reviewer_id, decision, comment)
VALUES (ri_guardia, v_company, u_pd, 'aprobado', NULL);

RAISE NOTICE 'Demo operativa cargada: buque %, 5 registros', v_vessel;
END $seed$;

COMMIT;
