-- 900_demo_chiarmar.sql
--
-- Catálogo de DEMOSTRACIÓN, tomado del relevamiento de Chiarmar
-- (docs/01-catalogo-registros-chiarmar.md). NO es el catálogo de ninguna
-- empresa cliente: se carga sólo para validar que el esquema soporta la
-- variedad real de formularios de un MGS. Xeitosiño y Pesantar cargan el suyo.
--
-- Cubre a propósito los patrones difíciles del relevamiento:
--   * maestro de buque (RMGS-04)         * checklist recurrente (RE-01A, RO-05C)
--   * tabla de filas repetibles (RM-04B) * registro que dispara otro (RE-01D)
--   * emisor restringido por rol (NNC)   * checklist diario (RO-10C)
--   * multi-firma con roles (RM-04B)     * referencia a matriz de riesgo (RO-07A)

-- Se difiere la validación de referencias cruzadas del catálogo: RE-01D
-- referencia a RO-07A y RE-01R, que se insertan en el mismo lote.
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO companies (id, name, cuit, status) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Pesquera Chiarmar S.A. (demo)', '30-12345678-9', 'activo')
ON CONFLICT DO NOTHING;

INSERT INTO vessels (id, company_id, name, matricula, vessel_type, service, specific_operation, specs) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Huafeng 827', 'M-0827', 'buque motor', 'pesquero', 'arrastrero',
   '{"eslora_m": 56.4, "manga_m": 9.8, "puntal_m": 5.6, "trb": 745, "motor": "Yanmar 6N330", "potencia_hp": 1800}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO manual_versions (id, company_id, revision_number, regulation, effective_date, status) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Rev. 04', 'Ord. PNA 05/18', '2024-01-01', 'vigente')
ON CONFLICT DO NOTHING;

INSERT INTO procedures (manual_version_id, company_id, code, name, sort_order) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'MGS',   'Manual de Gestión de Seguridad', 0),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PE-01', 'Preparación para Emergencias a Bordo', 1),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PO-03', 'Entrenamiento del Personal', 3),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PM-04', 'Mantenimiento del Buque y del Equipo', 4),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PO-05', 'Operaciones de a Bordo', 5),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PA-06', 'Auditorías, Revisiones y No Conformidades', 6),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PO-07', 'Investigación de Accidentes e Incidentes', 7),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'PO-10', 'Trabajo Seguro en Buques Inactivos', 10)
ON CONFLICT DO NOTHING;

-- Helper local: resuelve procedure_id por código dentro de este manual.
CREATE OR REPLACE FUNCTION pg_temp.proc(p_code text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM procedures
  WHERE manual_version_id = '33333333-3333-3333-3333-333333333333' AND code = p_code;
$$;

INSERT INTO record_types (procedure_id, company_id, code, name, category, recurrence_type,
                          recurrence_days, scope, allowed_creator_roles, allowed_reviewer_roles,
                          signature_requirement, field_schema)
VALUES
-- ---------------------------------------------------------------- RMGS-04 ---
(pg_temp.proc('MGS'), '11111111-1111-1111-1111-111111111111', 'RMGS-04',
 'Flota de Buques y matrículas', 'master_data', 'none', NULL, 'company',
 '{persona_designada}', '{armador}', 'manuscrita',
 '[{"key":"buque","type":"text","label":"Nombre del buque","required":true},
   {"key":"matricula","type":"text","label":"Matrícula","required":true},
   {"key":"tipo","type":"select","label":"Tipo","options":["Buque motor","Buque pesquero","Remolcador"]},
   {"key":"ficha_tecnica","type":"table","label":"Ficha técnica",
    "columns":[{"key":"caracteristica","type":"text"},{"key":"valor","type":"text"}]},
   {"key":"firma_pd","type":"signature_block","signer_role":"persona_designada"}]'::jsonb),

-- ---------------------------------------------------------------- RE-01 A ---
-- Zafarrancho de incendio: recurrencia fija de 30 días (los otros tipos de
-- ejercicio son otros record_types con 60 / 365).
(pg_temp.proc('PE-01'), '11111111-1111-1111-1111-111111111111', 'RE-01A-INC',
 'Ejercicio de Zafarrancho — Incendio', 'scheduled_checklist', 'fixed_interval_days', 30, 'vessel',
 '{capitan}', '{persona_designada,asesor_externo}', 'ambas',
 '[{"key":"tema_tratado","type":"textarea","label":"Tema tratado en el ejercicio","required":true},
   {"key":"duracion_min","type":"number","label":"Duración (minutos)"},
   {"key":"asistentes","type":"table","label":"Asistentes",
    "columns":[{"key":"nombre","type":"text"},{"key":"dni","type":"text"},{"key":"puesto","type":"text"}]},
   {"key":"observaciones","type":"textarea","label":"Observaciones"},
   {"key":"firma_capitan","type":"signature_block","signer_role":"capitan"}]'::jsonb),

-- ---------------------------------------------------------------- RO-07 A ---
-- Se carga antes que RE-01D porque éste la referencia en triggers_record_type
-- (el trigger es diferible, pero el orden explícito documenta la dependencia).
(pg_temp.proc('PO-07'), '11111111-1111-1111-1111-111111111111', 'RO-07A',
 'Acaecimiento Médico / Investigación de accidentes', 'incident_event', 'on_event', NULL, 'vessel',
 '{capitan,oficial,persona_designada}', '{persona_designada,responsable_sh}', 'ambas',
 '[{"key":"tripulante","type":"user_reference","label":"Tripulante afectado","required":true},
   {"key":"fecha_hecho","type":"date","label":"Fecha del hecho","required":true},
   {"key":"sintomas","type":"textarea","label":"Síntomas / descripción","required":true},
   {"key":"riesgo_asociado","type":"risk_reference","label":"Cuadro de la matriz de riesgo (PO-08)"},
   {"key":"medidas_correctivas","type":"table","label":"Plan de medidas correctivas",
    "columns":[{"key":"medida","type":"text"},{"key":"responsable","type":"text"},{"key":"plazo","type":"date"}]},
   {"key":"firma_capitan","type":"signature_block","signer_role":"capitan"},
   {"key":"firma_pd","type":"signature_block","signer_role":"persona_designada"}]'::jsonb),

-- ----------------------------------------------------------------- RE-01R ---
(pg_temp.proc('PE-01'), '11111111-1111-1111-1111-111111111111', 'RE-01R',
 'Remolque de emergencia', 'incident_event', 'on_event', NULL, 'vessel',
 '{capitan}', '{persona_designada}', 'ambas',
 '[{"key":"posicion_lat","type":"text","label":"Latitud"},
   {"key":"posicion_lon","type":"text","label":"Longitud"},
   {"key":"buque_remolcador","type":"text","label":"Buque remolcador"},
   {"key":"descripcion","type":"textarea","label":"Descripción de la maniobra"},
   {"key":"firma_capitan","type":"signature_block","signer_role":"capitan"}]'::jsonb),

-- ----------------------------------------------------------------- RE-01D ---
-- Patrón "un registro dispara otro": los booleanos marcados con
-- triggers_record_type le dicen a la UI qué instancia hija ofrecer crear.
(pg_temp.proc('PE-01'), '11111111-1111-1111-1111-111111111111', 'RE-01D',
 'Incendio', 'incident_event', 'on_event', NULL, 'vessel',
 '{capitan}', '{persona_designada,asesor_externo}', 'ambas',
 '[{"key":"descripcion","type":"textarea","label":"Descripción del siniestro","required":true},
   {"key":"lugar_inicio","type":"text","label":"Lugar de inicio del incendio"},
   {"key":"condiciones_meteo","type":"text","label":"Condiciones hidrometeorológicas"},
   {"key":"medidas_preventivas","type":"checklist","label":"Medidas preventivas tomadas",
    "options":["Corte suministro eléctrico","Cierre de ventilación","Puertas corta fuego","Puertas estancas"]},
   {"key":"elementos_usados","type":"checklist","label":"Elementos de lucha contra incendio",
    "options":["E.R.A","Mangueras de incendio","Extintores","Equipo de CO2","Traje de bombero"]},
   {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
   {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
   {"key":"hubo_heridos","type":"boolean","label":"Hubo heridos","triggers_record_type":"RO-07A"},
   {"key":"necesita_remolque","type":"boolean","label":"Necesita remolque","triggers_record_type":"RE-01R"},
   {"key":"firma_capitan","type":"signature_block","signer_role":"capitan"}]'::jsonb),

-- ---------------------------------------------------------------- RO-03 A ---
(pg_temp.proc('PO-03'), '11111111-1111-1111-1111-111111111111', 'RO-03A',
 'Políticas y Familiarización con el SGS — Tripulante', 'incident_event', 'on_event', NULL, 'vessel',
 '{capitan,oficial}', '{persona_designada}', 'ambas',
 '[{"key":"tripulante","type":"user_reference","label":"Tripulante","required":true},
   {"key":"puesto","type":"text","label":"Puesto a bordo","required":true},
   {"key":"temas","type":"checklist","label":"Temas de familiarización",
    "options":["Políticas de la empresa","Organigrama y PD","Uso de EPP","Zafarranchos y puntos de reunión",
               "Chalecos y balsas salvavidas","Lucha contra incendio","Hombre al agua","Comunicaciones",
               "Reporte de no conformidades"]},
   {"key":"firma_tripulante","type":"signature_block","signer_role":"tripulante"},
   {"key":"firma_responsable","type":"signature_block","signer_role":"capitan"}]'::jsonb),

-- ---------------------------------------------------------------- RM-04 B ---
-- Tabla de filas repetibles + tres firmas con roles distintos.
(pg_temp.proc('PM-04'), '11111111-1111-1111-1111-111111111111', 'RM-04B',
 'Pedido de Materiales', 'master_data', 'on_event', NULL, 'vessel',
 '{capitan,jefe_maquinas,oficial}', '{area_tecnica}', 'manuscrita',
 '[{"key":"marea","type":"text","label":"Marea N°"},
   {"key":"sector","type":"select","label":"Sector","options":["Puente","Cubierta","Máquina","Técnica/Armamento"]},
   {"key":"items","type":"table","label":"Ítems solicitados",
    "columns":[{"key":"cantidad_pedida","type":"number"},
               {"key":"urgencia","type":"select","options":["Normal","Urgente"]},
               {"key":"descripcion","type":"text"},
               {"key":"cantidad_recibida","type":"number"}]},
   {"key":"firma_pedido","type":"signature_block","signer_role":"solicitante"},
   {"key":"firma_recibido","type":"signature_block","signer_role":"recibe"},
   {"key":"firma_conforme","type":"signature_block","signer_role":"conforme"}]'::jsonb),

-- ---------------------------------------------------------------- RO-05 C ---
(pg_temp.proc('PO-05'), '11111111-1111-1111-1111-111111111111', 'RO-05C',
 'Controles previos a zarpada y arribo', 'scheduled_checklist', 'on_event', NULL, 'vessel',
 '{capitan,oficial}', '{persona_designada}', 'pin',
 '[{"key":"maniobra","type":"select","label":"Maniobra","options":["Zarpada","Arribo"],"required":true},
   {"key":"controles","type":"checklist","label":"Controles",
    "options":["Documentación del buque a bordo","Dotación completa y embarcada","Pronóstico meteorológico consultado",
               "Equipos de navegación operativos","Equipos de comunicación probados","Luces de navegación",
               "Achique y sentinas verificadas","Combustible y aceite suficientes","Víveres y agua potable",
               "Elementos de salvamento en posición","Extintores en posición y con carga","Escotillas y portas estancas",
               "Carga estibada y trincada","Despacho de PNA","Plan de navegación informado"],"required":true},
   {"key":"observaciones","type":"textarea","label":"Observaciones"},
   {"key":"firma_capitan","type":"signature_block","signer_role":"capitan"}]'::jsonb),

-- ------------------------------------------------------------- RA-06 NNC ---
-- Emisores restringidos: la NNC sólo la pueden emitir estos roles.
(pg_temp.proc('PA-06'), '11111111-1111-1111-1111-111111111111', 'RNNC',
 'Nota de No Conformidad', 'management_review', 'on_event', NULL, 'vessel',
 '{armador,area_tecnica,persona_designada,capitan,auditor,asesor_externo}',
 '{persona_designada,armador}', 'manuscrita',
 '[{"key":"origen","type":"select","label":"Origen del hallazgo",
    "options":["Auditoría interna","Auditoría externa","Inspección PNA","Observación a bordo","Revisión del SGS"],"required":true},
   {"key":"procedimiento_afectado","type":"text","label":"Procedimiento / registro afectado"},
   {"key":"descripcion","type":"textarea","label":"Descripción de la no conformidad","required":true},
   {"key":"accion_propuesta","type":"textarea","label":"Acción correctiva propuesta"},
   {"key":"plazo","type":"date","label":"Plazo de resolución"},
   {"key":"firma_emisor","type":"signature_block","signer_role":"auditor"}]'::jsonb),

-- ---------------------------------------------------------------- RO-10 C ---
-- Checklist diario mientras el buque está retirado de servicio.
(pg_temp.proc('PO-10'), '11111111-1111-1111-1111-111111111111', 'RO-10C',
 'Verificación de Buque en Puerto', 'inactive_vessel', 'daily', NULL, 'vessel',
 '{guardia_puerto,capitan}', '{persona_designada}', 'pin',
 '[{"key":"controles","type":"checklist","label":"Verificación diaria",
    "options":["Amarras en buen estado","Sin ingreso de agua","Sentinas achicadas","Energía de tierra conectada",
               "Extintores en posición","Accesos cerrados y señalizados","Sin presencia de personas no autorizadas"],
    "required":true},
   {"key":"novedades","type":"textarea","label":"Novedades"},
   {"key":"firma_guardia","type":"signature_block","signer_role":"guardia_puerto"}]'::jsonb)
ON CONFLICT DO NOTHING;
