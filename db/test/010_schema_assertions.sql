-- 010_schema_assertions.sql
-- Aserciones sobre el esquema. Corren contra una base descartable creada por
-- scripts/db-test.sh (migraciones + seed ya aplicados).

\set ON_ERROR_STOP on
SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION pg_temp.assert(cond boolean, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN
    RAISE EXCEPTION 'ASSERT FALLÓ: %', msg;
  END IF;
END;
$$;

-- Ejecuta `stmt` esperando que falle; si el mensaje no contiene `expected`,
-- o si no falla, la aserción rompe.
CREATE OR REPLACE FUNCTION pg_temp.assert_fails(stmt text, expected text, msg text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE err text;
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    err := SQLERRM;
    IF position(lower(expected) IN lower(err)) = 0 THEN
      RAISE EXCEPTION 'ASSERT FALLÓ (%): esperaba un error con "%", se obtuvo "%"', msg, expected, err;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERT FALLÓ (%): la sentencia debía fallar y no falló', msg;
END;
$$;

\echo '  - seed cargado'
DO $$
BEGIN
  PERFORM pg_temp.assert((SELECT count(*) FROM roles) >= 20, 'catálogo de roles cargado');
  PERFORM pg_temp.assert((SELECT count(*) FROM record_types) = 10, '10 record_types de demo');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM record_type_versions) = (SELECT count(*) FROM record_types),
    'cada record_type tiene su snapshot de versión');
END $$;

\echo '  - field_schema: validación estructural'
DO $$
DECLARE proc_id uuid; cid uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  SELECT id INTO proc_id FROM procedures WHERE code = 'PO-05';

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-1', 'malo', 'incident_event',
             '[{"key":"Mal Nombre","type":"text"}]'::jsonb)$f$, proc_id, cid),
    'snake_case', 'rechaza claves que no son snake_case');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-2', 'malo', 'incident_event',
             '[{"key":"a","type":"text"},{"key":"a","type":"number"}]'::jsonb)$f$, proc_id, cid),
    'duplicada', 'rechaza claves duplicadas');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-3', 'malo', 'incident_event',
             '[{"key":"a","type":"inventado"}]'::jsonb)$f$, proc_id, cid),
    'desconocido', 'rechaza tipos de campo inexistentes');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-4', 'malo', 'incident_event',
             '[{"key":"a","type":"select"}]'::jsonb)$f$, proc_id, cid),
    'options', 'select sin options');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-5', 'malo', 'incident_event',
             '[{"key":"a","type":"signature_block"}]'::jsonb)$f$, proc_id, cid),
    'signer_role', 'signature_block sin signer_role');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-6', 'malo', 'incident_event',
             '[{"key":"a","type":"signature_block","signer_role":"rol_que_no_existe"}]'::jsonb)$f$, proc_id, cid),
    'signer_role inexistente', 'signer_role debe existir en roles');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category, field_schema)
             VALUES (%L, %L, 'X-7', 'malo', 'incident_event',
             '[{"key":"a","type":"boolean","triggers_record_type":"NO-EXISTE"}]'::jsonb)$f$, proc_id, cid),
    'triggers_record_type', 'triggers_record_type debe apuntar a un registro del manual');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category,
                                        recurrence_type, recurrence_days, field_schema)
             VALUES (%L, %L, 'X-8', 'malo', 'scheduled_checklist', 'fixed_interval_days', NULL, '[]'::jsonb)$f$,
           proc_id, cid),
    'recurrence_days', 'fixed_interval_days exige recurrence_days');
END $$;

\echo '  - versionado del formulario'
DO $$
DECLARE rt_id uuid; v_before integer; v_after integer;
BEGIN
  SELECT id, version INTO rt_id, v_before FROM record_types WHERE code = 'RO-05C';

  UPDATE record_types SET status = 'vigente' WHERE id = rt_id;   -- cambio irrelevante
  SELECT version INTO v_after FROM record_types WHERE id = rt_id;
  PERFORM pg_temp.assert(v_after = v_before, 'un update sin cambios de formulario no sube la versión');

  UPDATE record_types
     SET field_schema = field_schema || '[{"key":"nuevo_control","type":"text"}]'::jsonb
   WHERE id = rt_id;
  SELECT version INTO v_after FROM record_types WHERE id = rt_id;
  PERFORM pg_temp.assert(v_after = v_before + 1, 'cambiar field_schema sube la versión');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM record_type_versions WHERE record_type_id = rt_id) = 2,
    'queda congelada la versión anterior del formulario');
END $$;

\echo '  - roles con vigencia y exclusividad (RMGS-02)'
DO $$
DECLARE
  cid uuid := '11111111-1111-1111-1111-111111111111';
  vid uuid := '22222222-2222-2222-2222-222222222222';
  u1 uuid; u2 uuid;
BEGIN
  INSERT INTO users (company_id, full_name, dni) VALUES (cid, 'Capitán Saliente', '20111111')
    RETURNING id INTO u1;
  INSERT INTO users (company_id, full_name, dni) VALUES (cid, 'Capitán Entrante', '20222222')
    RETURNING id INTO u2;

  INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES (u1, 'capitan', cid, vid);

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO user_roles (user_id, role_code, company_id, vessel_id)
              VALUES (%L, 'capitan', %L, %L)$f$, u2, cid, vid),
    'ya hay un capitan vigente', 'no admite dos capitanes vigentes en el mismo buque');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO user_roles (user_id, role_code, company_id) VALUES (%L, 'capitan', %L)$f$, u2, cid),
    'requiere vessel_id', 'un rol embarcado exige buque');

  -- cambio de mando: se cierra el saliente y recién ahí entra el entrante
  UPDATE user_roles SET valid_to = current_date WHERE user_id = u1 AND role_code = 'capitan';
  INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES (u2, 'capitan', cid, vid);
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM user_roles WHERE role_code = 'capitan' AND vessel_id = vid AND valid_to IS NULL) = 1,
    'queda un solo capitán vigente tras el cambio de mando');
  -- el rol se cerró hoy: sigue siendo consultable con fecha del día del relevo
  PERFORM pg_temp.assert(
    'capitan' = ANY (sgs_user_role_codes(u1, vid, current_date)),
    'el historial conserva el rol del capitán saliente en la fecha del relevo');
  PERFORM pg_temp.assert(
    NOT ('capitan' = ANY (sgs_user_role_codes(u1, vid, current_date + 1))),
    'el capitán saliente ya no tiene el rol al día siguiente');
END $$;

\echo '  - alcance, permisos de emisión y validación de datos'
DO $$
DECLARE
  cid  uuid := '11111111-1111-1111-1111-111111111111';
  vid  uuid := '22222222-2222-2222-2222-222222222222';
  rt   uuid; rt_ver integer;
  rt_c uuid;
  cap  uuid; trip uuid;
  ri   uuid;
BEGIN
  SELECT id, version INTO rt, rt_ver FROM record_types WHERE code = 'RE-01D';
  SELECT id INTO rt_c FROM record_types WHERE code = 'RMGS-04';
  SELECT u.id INTO cap FROM users u WHERE u.full_name = 'Capitán Entrante';
  INSERT INTO users (company_id, full_name, dni) VALUES (cid, 'Marinero', '20333333') RETURNING id INTO trip;
  INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES (trip, 'tripulante', cid, vid);

  -- scope=vessel exige buque
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_instances (company_id, record_type_id, record_type_version, created_by)
              VALUES (%L, %L, %s, %L)$f$, cid, rt, rt_ver, cap),
    'falta vessel_id', 'un registro de buque exige vessel_id');

  -- scope=company no lleva buque
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id, created_by)
              VALUES (%L, %L, 1, %L, %L)$f$, cid, rt_c, vid, cap),
    'no lleva vessel_id', 'un registro de compañía no lleva vessel_id');

  -- emisor restringido por rol
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id, created_by)
              VALUES (%L, %L, %s, %L, %L)$f$, cid, rt, rt_ver, vid, trip),
    'rol habilitado', 'un tripulante no puede emitir un RE-01D');

  -- borrador: se guarda incompleto (requisito de carga offline)
  INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id, created_by, data)
  VALUES (cid, rt, rt_ver, vid, cap, '{"lugar_inicio":"Sala de máquinas"}'::jsonb)
  RETURNING id INTO ri;
  PERFORM pg_temp.assert((SELECT status FROM record_instances WHERE id = ri) = 'borrador',
                         'la instancia nace en borrador');

  -- al enviar se valida contra el field_schema congelado
  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances SET status = 'pendiente_revision' WHERE id = %L$f$, ri),
    'obligatorio', 'no se envía sin los campos obligatorios');

  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances
                 SET data = '{"descripcion":"x","campo_fantasma":1}'::jsonb,
                     status = 'pendiente_revision' WHERE id = %L$f$, ri),
    'no declarado', 'rechaza campos fuera del formulario');

  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances
                 SET data = '{"descripcion":"x","medidas_preventivas":[{"item":"Cosa inventada","status":"ok"}]}'::jsonb,
                     status = 'pendiente_revision' WHERE id = %L$f$, ri),
    'no declarado en el checklist', 'rechaza ítems fuera del checklist');

  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances
                 SET data = '{"descripcion":"x","informa_pna":"si"}'::jsonb,
                     status = 'pendiente_revision' WHERE id = %L$f$, ri),
    'booleano', 'rechaza un booleano mal tipado');

  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances
                 SET data = '{"descripcion":"x","firma_capitan":"garabato"}'::jsonb,
                     status = 'pendiente_revision' WHERE id = %L$f$, ri),
    'signature_block', 'la firma no se guarda dentro de data');

  -- envío válido
  UPDATE record_instances
     SET data = '{"descripcion":"Principio de incendio en sala de máquinas",
                  "lugar_inicio":"Sala de máquinas",
                  "medidas_preventivas":[{"item":"Corte suministro eléctrico","status":"ok"},
                                         {"item":"Cierre de ventilación","status":"no_ok","observacion":"Trampilla trabada"}],
                  "elementos_usados":[{"item":"Extintores","status":"ok"}],
                  "informa_compania":true, "informa_pna":true,
                  "hubo_heridos":false, "necesita_remolque":false}'::jsonb,
         status = 'pendiente_revision'
   WHERE id = ri;
  PERFORM pg_temp.assert((SELECT submitted_at IS NOT NULL FROM record_instances WHERE id = ri),
                         'el envío sella submitted_at');
END $$;

\echo '  - firmas, revisión y sólo-lectura del aprobado'
DO $$
DECLARE
  cid uuid := '11111111-1111-1111-1111-111111111111';
  ri  uuid; pd uuid; cap uuid; att uuid; rev uuid;
BEGIN
  SELECT ri2.id INTO ri FROM record_instances ri2
    JOIN record_types rt ON rt.id = ri2.record_type_id WHERE rt.code = 'RE-01D' LIMIT 1;
  SELECT id INTO cap FROM users WHERE full_name = 'Capitán Entrante';
  INSERT INTO users (company_id, full_name, dni) VALUES (cid, 'Persona Designada', '20444444') RETURNING id INTO pd;
  INSERT INTO user_roles (user_id, role_code, company_id) VALUES (pd, 'persona_designada', cid);

  INSERT INTO attachments (company_id, file_url, file_type, uploaded_by)
  VALUES (cid, 's3://firmas/cap.png', 'image', cap) RETURNING id INTO att;

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO signatures (record_instance_id, signer_user_id, signer_name, signer_role, field_key, method)
              VALUES (%L, %L, 'Capitán Entrante', 'capitan', 'firma_capitan', 'canvas')$f$, ri, cap),
    'signatures_canvas_needs_image', 'una firma manuscrita exige la imagen');

  INSERT INTO signatures (record_instance_id, signer_user_id, signer_name, signer_role, field_key, method, signature_image_id)
  VALUES (ri, cap, 'Capitán Entrante', 'capitan', 'firma_capitan', 'canvas', att);

  PERFORM pg_temp.assert(
    (SELECT bool_and(is_signed) FROM v_record_instance_signatures WHERE record_instance_id = ri),
    'la vista de firmas muestra el bloque ya firmado');

  PERFORM pg_temp.assert_fails(
    format($f$DELETE FROM signatures WHERE record_instance_id = %L$f$, ri),
    'append-only', 'las firmas no se borran');

  -- sólo revisa quien tiene un rol habilitado
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_reviews (record_instance_id, reviewer_id, decision, comment)
              VALUES (%L, %L, 'aprobado', 'me autoapruebo')$f$, ri, cap),
    'rol habilitado para revisar', 'el capitán no puede aprobar su propio registro');

  -- observación: exige comentario y devuelve el registro a bordo
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_reviews (record_instance_id, reviewer_id, decision)
              VALUES (%L, %L, 'observado')$f$, ri, pd),
    'record_reviews_observado_needs_comment', 'observar exige comentario');

  INSERT INTO record_reviews (record_instance_id, reviewer_id, decision, comment)
  VALUES (ri, pd, 'observado', 'Falta detallar la trampilla de ventilación trabada');
  PERFORM pg_temp.assert((SELECT status FROM record_instances WHERE id = ri) = 'observado',
                         'la observación deja la instancia en observado');

  UPDATE record_instances SET status = 'pendiente_revision' WHERE id = ri;
  INSERT INTO record_reviews (record_instance_id, reviewer_id, decision, comment)
  VALUES (ri, pd, 'aprobado', 'Corregido');
  PERFORM pg_temp.assert((SELECT status FROM record_instances WHERE id = ri) = 'aprobado',
                         'la aprobación cierra la instancia');

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM record_reviews WHERE record_instance_id = ri) = 2,
    'el historial de revisiones conserva las dos decisiones');

  PERFORM pg_temp.assert_fails(
    format($f$UPDATE record_instances SET data = '{}'::jsonb WHERE id = %L$f$, ri),
    'sólo lectura', 'un registro aprobado no se edita');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_reviews (record_instance_id, reviewer_id, decision, comment)
              VALUES (%L, %L, 'observado', 'tarde')$f$, ri, pd),
    'ya fue aprobado', 'un registro aprobado no admite nuevas revisiones');
END $$;

\echo '  - permiso para editar el catálogo'
DO $$
DECLARE
  cid uuid := '11111111-1111-1111-1111-111111111111';
  cap uuid; pd uuid; proc uuid;
BEGIN
  SELECT id INTO cap FROM users WHERE full_name = 'Capitán Entrante';
  SELECT id INTO pd  FROM users WHERE full_name = 'Persona Designada';
  SELECT id INTO proc FROM procedures WHERE code = 'PO-05';

  -- sin actor declarado (seeds, migraciones) no se verifica nada
  PERFORM set_config('sgs.actor_user_id', '', true);
  INSERT INTO record_types (procedure_id, company_id, code, name, category)
  VALUES (proc, cid, 'RO-05Z', 'Alta sin actor', 'scheduled_checklist');

  -- el capitán no administra el catálogo
  PERFORM set_config('sgs.actor_user_id', cap::text, true);
  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_types (procedure_id, company_id, code, name, category)
              VALUES (%L, %L, 'RO-05X', 'No debería', 'scheduled_checklist')$f$, proc, cid),
    'rol habilitado para editar', 'el capitán no puede crear tipos de registro');

  -- la Persona Designada sí
  PERFORM set_config('sgs.actor_user_id', pd::text, true);
  INSERT INTO record_types (procedure_id, company_id, code, name, category)
  VALUES (proc, cid, 'RO-05Y', 'Alta por la PD', 'scheduled_checklist');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM record_types WHERE code = 'RO-05Y') = 1,
    'la PD puede crear tipos de registro');

  PERFORM set_config('sgs.actor_user_id', '', true);
  DELETE FROM record_types WHERE code IN ('RO-05Y', 'RO-05Z');
END $$;

\echo '  - aislamiento multi-empresa'
DO $$
DECLARE
  other uuid; other_vessel uuid; rt uuid; rt_ver integer;
BEGIN
  INSERT INTO companies (name) VALUES ('Xeitosiño S.A. (demo)') RETURNING id INTO other;
  INSERT INTO vessels (company_id, name, matricula) VALUES (other, 'Buque Ajeno', 'M-9999')
    RETURNING id INTO other_vessel;
  SELECT id, version INTO rt, rt_ver FROM record_types WHERE code = 'RE-01D';

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id)
              VALUES ('11111111-1111-1111-1111-111111111111', %L, %s, %L)$f$, rt, rt_ver, other_vessel),
    'foreign key', 'no se puede cargar un registro sobre el buque de otra empresa');

  PERFORM pg_temp.assert_fails(
    format($f$INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id)
              VALUES (%L, %L, %s, %L)$f$, other, rt, rt_ver, other_vessel),
    'foreign key', 'no se puede usar el catálogo de otra empresa');
END $$;

\echo '  - trazabilidad (audit_log)'
DO $$
DECLARE ri uuid;
BEGIN
  SELECT ri2.id INTO ri FROM record_instances ri2
    JOIN record_types rt ON rt.id = ri2.record_type_id WHERE rt.code = 'RE-01D' LIMIT 1;

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM audit_log WHERE entity_type = 'record_instance' AND entity_id = ri
       AND action = 'created') = 1,
    'se audita la creación de la instancia');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM audit_log WHERE entity_type = 'record_instance' AND entity_id = ri
       AND action = 'status_changed') >= 3,
    'se auditan los cambios de estado');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM audit_log WHERE entity_type = 'signature') = 1,
    'se audita la firma');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM audit_log WHERE entity_type = 'record_review') = 2,
    'se auditan las revisiones');
  PERFORM pg_temp.assert_fails(
    'DELETE FROM audit_log', 'append-only', 'la bitácora no se borra');
END $$;

\echo '  - vistas de control (RA-06C, desvíos, vencimientos)'
DO $$
DECLARE
  cid uuid := '11111111-1111-1111-1111-111111111111';
  vid uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  -- RE-01A-INC nunca se cargó: aparece como sin_registro
  PERFORM pg_temp.assert(
    (SELECT compliance_status FROM v_record_compliance
      WHERE record_type_code = 'RE-01A-INC' AND vessel_id = vid) = 'sin_registro',
    'un recurrente sin instancias figura como sin_registro');

  -- una revisión superada no duplica las obligaciones del tablero
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM v_record_compliance
      WHERE record_type_code = 'RE-01A-INC' AND vessel_id = vid) = 1,
    'cada obligación aparece una sola vez');

  -- los de evento no vencen
  PERFORM pg_temp.assert(
    (SELECT compliance_status FROM v_record_compliance
      WHERE record_type_code = 'RE-01D' AND vessel_id = vid) = 'no_aplica',
    'un registro por evento no tiene vencimiento');

  -- el desvío del checklist queda expuesto sin tabla aparte
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM v_record_nonconformities WHERE company_id = cid) = 1,
    'el ítem no_ok del checklist aparece como desvío');
  PERFORM pg_temp.assert(
    (SELECT observacion FROM v_record_nonconformities WHERE company_id = cid) = 'Trampilla trabada',
    'el desvío conserva la observación');

  -- vencimientos de certificados
  INSERT INTO vessel_certificates (company_id, vessel_id, certificate_label, certificate_number, expires_at)
  VALUES (cid, vid, 'Certificado de Seguridad de la Navegación', 'CSN-1', current_date - 3),
         (cid, vid, 'Certificado de Arqueo', 'ARQ-1', current_date + 10),
         (cid, vid, 'Certificado de Francobordo', 'FRB-1', current_date + 400);
  PERFORM pg_temp.assert(
    (SELECT status FROM v_vessel_certificate_status WHERE certificate_number = 'CSN-1') = 'vencido',
    'certificado vencido');
  PERFORM pg_temp.assert(
    (SELECT status FROM v_vessel_certificate_status WHERE certificate_number = 'ARQ-1') = 'por_vencer',
    'certificado por vencer');
  PERFORM pg_temp.assert(
    (SELECT status FROM v_vessel_certificate_status WHERE certificate_number = 'FRB-1') = 'vigente',
    'certificado vigente');
END $$;

\echo '  - registros que obligan a cargar otro'
DO $$
DECLARE
  cid uuid := '11111111-1111-1111-1111-111111111111';
  vid uuid := '22222222-2222-2222-2222-222222222222';
  cap uuid; rt uuid; ver integer; rt_hijo uuid; padre uuid;
BEGIN
  SELECT id INTO cap FROM users WHERE full_name = 'Capitán Entrante';
  SELECT id, version INTO rt, ver FROM record_types WHERE code = 'RE-01D';
  SELECT id INTO rt_hijo FROM record_types WHERE code = 'RO-07A';

  -- un incendio con heridos, ya enviado
  INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id,
                                created_by, status, data)
  VALUES (cid, rt, ver, vid, cap, 'pendiente_revision',
          '{"descripcion":"Incendio con heridos","hubo_heridos":true,"necesita_remolque":false}'::jsonb)
  RETURNING id INTO padre;

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM v_registros_hijos_pendientes WHERE record_instance_id = padre) = 1,
    'el incendio con heridos exige cargar el acaecimiento médico');
  PERFORM pg_temp.assert(
    (SELECT required_record_type_code FROM v_registros_hijos_pendientes
      WHERE record_instance_id = padre) = 'RO-07A',
    'y dice cuál');

  -- al cargar el hijo enlazado, deja de estar pendiente
  INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id,
                                created_by, parent_record_instance_id, data)
  SELECT cid, rt_hijo, version, vid, cap, padre, '{}'::jsonb
    FROM record_types WHERE id = rt_hijo;

  PERFORM pg_temp.assert(
    (SELECT count(*) FROM v_registros_hijos_pendientes WHERE record_instance_id = padre) = 0,
    'con el hijo cargado ya no figura pendiente');

  -- un borrador todavía no obliga a nada
  INSERT INTO record_instances (company_id, record_type_id, record_type_version, vessel_id,
                                created_by, data)
  VALUES (cid, rt, ver, vid, cap, '{"hubo_heridos":true}'::jsonb);
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM v_registros_hijos_pendientes WHERE company_id = cid) = 0,
    'un borrador no genera la obligación');
END $$;

\echo '  - matriz de riesgo'
DO $$
DECLARE cid uuid := '11111111-1111-1111-1111-111111111111'; ra uuid;
BEGIN
  INSERT INTO risk_assessments (company_id, chart_number, work_position, hazard_source,
                                probability, consequence, control_measures,
                                residual_probability, residual_consequence)
  VALUES (cid, 'Cuadro N° 99', 'Jefe de Máquinas', 'Superficies calientes en sala de máquinas',
          3, 3, 'Aislación térmica, EPP, señalización', 1, 2)
  RETURNING id INTO ra;

  PERFORM pg_temp.assert((SELECT risk_score FROM risk_assessments WHERE id = ra) = 9, 'score = P x C');
  PERFORM pg_temp.assert((SELECT risk_level(risk_score) FROM risk_assessments WHERE id = ra) = 'alto', 'riesgo alto');
  PERFORM pg_temp.assert((SELECT risk_level(residual_score) FROM risk_assessments WHERE id = ra) = 'bajo',
                         'riesgo residual bajo');
  PERFORM pg_temp.assert_fails(
    format($f$UPDATE risk_assessments SET probability = 7 WHERE id = %L$f$, ra),
    'risk_assessments_scale', 'la escala es 1-3');
END $$;

\echo '  - todas las aserciones pasaron'
