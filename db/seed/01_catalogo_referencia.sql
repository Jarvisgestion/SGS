-- 01_catalogo_referencia.sql
--
-- Catálogo de referencia derivado de docs/01-catalogo-registros-chiarmar.md.
--
-- IMPORTANTE: se carga bajo una empresa DEMO, no bajo Xeitosiño ni Pesantar. El
-- manual de Chiarmar se usó como modelo estructural para descubrir los patrones de
-- formulario; este seed sirve para (a) validar que el esquema aguanta la variedad
-- real de un MGS y (b) tener un punto de partida editable. La decisión de si
-- Xeitosiño/Pesantar arrancan de cero o clonan este catálogo está pendiente
-- (docs/02, "Próximos pasos").
--
-- field_schema: se cargan completos SOLO los formularios cuyos campos están
-- efectivamente relevados. Los que quedan en '[]' tienen la estructura (código,
-- categoría, alcance, recurrencia, firmas, roles) pero les falta el detalle de
-- campos, que sale del formulario real de cada empresa.

BEGIN;

CREATE FUNCTION pg_temp.seed_rt(
  p_procedure_id     uuid,
  p_code             text,
  p_name             text,
  p_category         text,
  p_scope            text,
  p_recurrence_type  text    DEFAULT 'none',
  p_recurrence_days  integer DEFAULT NULL,
  p_creators         text[]  DEFAULT '{}',
  p_reviewers        text[]  DEFAULT '{persona_designada,asesor_externo}',
  p_signature        text    DEFAULT 'configurable_por_firmante',
  p_field_schema     jsonb   DEFAULT '[]'::jsonb,
  p_sort             integer DEFAULT 0,
  p_requires_attachment boolean DEFAULT false,
  p_nota             text    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
  v_company uuid;
  v_rt      uuid;
  v_ver     uuid;
BEGIN
  SELECT company_id INTO v_company FROM procedures WHERE id = p_procedure_id;

  INSERT INTO record_types (procedure_id, company_id, code, name, category, scope, sort_order)
  VALUES (p_procedure_id, v_company, p_code, p_name, p_category, p_scope, p_sort)
  RETURNING id INTO v_rt;

  INSERT INTO record_type_versions (
    record_type_id, company_id, version, recurrence_type, recurrence_days,
    allowed_creator_roles, allowed_reviewer_roles, signature_requirement,
    field_schema, requires_signed_attachment, change_description, effective_from, status)
  VALUES (
    v_rt, v_company, 1, p_recurrence_type, p_recurrence_days,
    p_creators, p_reviewers, p_signature, p_field_schema, p_requires_attachment,
    coalesce(p_nota,
      CASE WHEN p_field_schema = '[]'::jsonb
           THEN 'Estructura relevada. Campos pendientes de relevar del formulario real de la empresa.'
           ELSE 'Versión inicial, campos relevados del formulario.' END),
    current_date, 'vigente')
  RETURNING id INTO v_ver;

  UPDATE record_types SET current_version_id = v_ver WHERE id = v_rt;
  RETURN v_rt;
END $fn$;


DO $seed$
DECLARE
  v_company uuid;
  v_manual  uuid;
  p_mgs uuid; p_pe01 uuid; p_po02 uuid; p_po03 uuid; p_pm04 uuid; p_po05 uuid;
  p_pa06 uuid; p_po07 uuid; p_po08 uuid; p_po09 uuid; p_po10 uuid;
BEGIN

INSERT INTO companies (name, legal_name, status, contact_emails)
VALUES ('Empresa Demo (catálogo de referencia)', 'Empresa Demo S.A.', 'activo',
        ARRAY['demo@sgs.local'])
RETURNING id INTO v_company;

INSERT INTO manual_versions (company_id, revision_number, regulation_reference,
                             effective_date, status, notes)
VALUES (v_company, 'Rev. 01', 'Ord. PNA 05/18', current_date, 'vigente',
        'Catálogo de referencia derivado del relevamiento estructural. No es el '
        'manual de ninguna empresa real.')
RETURNING id INTO v_manual;

INSERT INTO procedures (manual_version_id, company_id, code, name, sort_order, purpose) VALUES
  (v_manual, v_company, 'MGS',   'Manual de Gestión de Seguridad — nivel compañía', 10, NULL),
  (v_manual, v_company, 'PE-01', 'Preparación para Emergencias a Bordo',            20, NULL),
  (v_manual, v_company, 'PO-02', 'Contratación del Personal',                       30,
     'No define registros propios: usa RO-09 (EPP) y RO-03A (familiarización).'),
  (v_manual, v_company, 'PO-03', 'Entrenamiento del Personal',                      40, NULL),
  (v_manual, v_company, 'PM-04', 'Mantenimiento del Buque y del Equipo',            50, NULL),
  (v_manual, v_company, 'PO-05', 'Operaciones de a Bordo',                          60, NULL),
  (v_manual, v_company, 'PA-06', 'Auditorías, Revisiones y No Conformidades',       70, NULL),
  (v_manual, v_company, 'PO-07', 'Investigación de Accidentes e Incidentes',        80, NULL),
  (v_manual, v_company, 'PO-08', 'Análisis de Riesgo',                              90, NULL),
  (v_manual, v_company, 'PO-09', 'Compra de Insumos y Entrega de EPP',             100, NULL),
  (v_manual, v_company, 'PO-10', 'Trabajo Seguro en Buques Inactivos',             110, NULL);

SELECT id INTO p_mgs  FROM procedures WHERE manual_version_id = v_manual AND code = 'MGS';
SELECT id INTO p_pe01 FROM procedures WHERE manual_version_id = v_manual AND code = 'PE-01';
SELECT id INTO p_po02 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-02';
SELECT id INTO p_po03 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-03';
SELECT id INTO p_pm04 FROM procedures WHERE manual_version_id = v_manual AND code = 'PM-04';
SELECT id INTO p_po05 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-05';
SELECT id INTO p_pa06 FROM procedures WHERE manual_version_id = v_manual AND code = 'PA-06';
SELECT id INTO p_po07 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-07';
SELECT id INTO p_po08 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-08';
SELECT id INTO p_po09 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-09';
SELECT id INTO p_po10 FROM procedures WHERE manual_version_id = v_manual AND code = 'PO-10';

-- =========================================================================
-- Nivel compañía (RMGS)
-- =========================================================================
PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-01', 'Políticas de la Empresa',
  'master_data', 'company', 'none', NULL, ARRAY['apoderado'], ARRAY['apoderado'],
  'manuscrita', '[]'::jsonb, 10);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-02', 'Cambio de Mando (Capitán / Jefe de Máquinas / PD)',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','jefe_maquinas','persona_designada'], ARRAY['persona_designada'],
  'ambas', $j$[
    {"key":"puesto","type":"select","label":"Puesto que se releva","required":true,
     "options":["Capitán","Jefe de Máquinas","Persona Designada"]},
    {"key":"fecha_relevo","type":"datetime","label":"Fecha y hora del relevo","required":true},
    {"key":"lugar","type":"text","label":"Lugar / puerto"},
    {"key":"saliente_nombre","type":"text","label":"Mando saliente","required":true},
    {"key":"entrante_nombre","type":"text","label":"Mando entrante","required":true},
    {"key":"novedades_capitan","type":"textarea","label":"Novedades — Capitán"},
    {"key":"novedades_maquinas","type":"textarea","label":"Novedades — Jefe de Máquinas"},
    {"key":"firma_saliente","type":"signature_block","label":"Firma mando saliente","signer_role":"mando_saliente"},
    {"key":"firma_entrante","type":"signature_block","label":"Firma mando entrante","signer_role":"mando_entrante"}
  ]$j$::jsonb, 20);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-03', 'Entrega de documentación',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada','armamento'],
  'configurable_por_firmante', $j$[
    {"key":"fecha","type":"date","label":"Fecha de entrega","required":true},
    {"key":"documentos","type":"table","label":"Documentación entregada","required":true,
     "columns":[
       {"key":"codigo","type":"text","label":"Código"},
       {"key":"descripcion","type":"text","label":"Descripción"},
       {"key":"cantidad","type":"number","label":"Cantidad"}]},
    {"key":"observaciones","type":"textarea","label":"Observaciones"},
    {"key":"firma_entrega","type":"signature_block","label":"Entrega","signer_role":"entrega"},
    {"key":"firma_recibe","type":"signature_block","label":"Recibe","signer_role":"recibe"}
  ]$j$::jsonb, 30);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-04', 'Flota de Buques y matrículas',
  'master_data', 'company', 'none', NULL,
  ARRAY['persona_designada'], ARRAY['persona_designada'], 'none', '[]'::jsonb, 40);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-05', 'Verificación de documentación (certificados)',
  'scheduled_checklist', 'vessel', 'monthly', NULL,
  ARRAY['persona_designada','armamento'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 50);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-06', 'Organigrama y medios de contacto',
  'master_data', 'company', 'none', NULL,
  ARRAY['persona_designada'], ARRAY['persona_designada'], 'none', '[]'::jsonb, 60);

PERFORM pg_temp.seed_rt(p_mgs, 'RMGS-07', 'Nombramiento de Persona Designada',
  'master_data', 'company', 'on_event', NULL,
  ARRAY['apoderado'], ARRAY['apoderado'], 'manuscrita', '[]'::jsonb, 70);

-- =========================================================================
-- PE-01 — Emergencias
-- =========================================================================
-- Este es el procedimiento del piloto.
--
-- El único registro que exige el PDF del formulario en papel firmado
-- (requires_signed_attachment) es RE-01A, el de zafarranchos. Los demás pueden
-- llevar adjuntos igual — el esquema lo permite en cualquier registro — pero no
-- los necesitan para poder aprobarse.
--
-- Procedencia de los campos: RE-01A, RE-01B y RE-01D salen del relevamiento
-- (docs/01). RE-01C, RE-01E, RE-01R y el cronograma se derivaron del mismo patrón
-- porque el relevamiento los describe pero no detalla sus campos — hay que
-- contrastarlos contra el formulario real antes de usarlos a bordo.

-- NOTA: el manual fija periodicidad por tipo de ejercicio (incendio/abandono 30 d,
-- colisión/varadura/hombre al agua/sin gobierno/espacios confinados 60 d,
-- buque-tierra 365 d). El modelo actual soporta UNA recurrencia por tipo de
-- registro: acá se toma la más exigente (30 d). Ver docs/03, limitación abierta.
PERFORM pg_temp.seed_rt(p_pe01, 'RE-01A', 'Ejercicio de Zafarrancho',
  'scheduled_checklist', 'vessel', 'fixed_interval_days', 30,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"tipo_ejercicio","type":"select","label":"Tipo de ejercicio","required":true,
     "options":["Incendio","Abandono","Colisión","Varadura","Hombre al agua",
                "Buque sin gobierno","Espacios confinados","Comunicación buque-tierra"]},
    {"key":"tema_tratado","type":"textarea","label":"Tema tratado","required":true},
    {"key":"duracion_min","type":"number","label":"Duración (minutos)"},
    {"key":"asistentes","type":"table","label":"Asistentes","required":true,
     "columns":[
       {"key":"nombre","type":"text","label":"Nombre y apellido"},
       {"key":"dni","type":"text","label":"DNI"},
       {"key":"puesto","type":"text","label":"Puesto"}]},
    {"key":"observaciones","type":"textarea","label":"Observaciones"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"}
  ]$j$::jsonb, 10, p_requires_attachment => true);

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01A-ANEXO', 'Cronograma anual de ejercicios',
  'master_data', 'vessel', 'fixed_interval_days', 365,
  ARRAY['capitan','persona_designada'], ARRAY['persona_designada'], 'none',
  $j$[
    {"key":"anio","type":"number","label":"Año del cronograma","required":true},
    {"key":"cronograma","type":"table","label":"Ejercicios programados","required":true,
     "columns":[
       {"key":"mes","type":"select","label":"Mes",
        "options":["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio",
                   "Agosto","Septiembre","Octubre","Noviembre","Diciembre"]},
       {"key":"tipo_ejercicio","type":"select","label":"Tipo de ejercicio",
        "options":["Incendio","Abandono","Colisión","Varadura","Hombre al agua",
                   "Buque sin gobierno","Espacios confinados","Comunicación buque-tierra"]},
       {"key":"fecha_prevista","type":"date","label":"Fecha prevista"},
       {"key":"fecha_realizada","type":"date","label":"Fecha realizada"}]},
    {"key":"observaciones","type":"textarea","label":"Observaciones"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"}
  ]$j$::jsonb, 20, p_nota => 'Campos derivados del cronograma anual descripto en el relevamiento (12 filas por tipo de ejercicio). A contrastar contra el formulario real.');

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01B', 'Buque sin Gobierno',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"descripcion","type":"textarea","label":"Descripción del acaecimiento","required":true},
    {"key":"posicion","type":"text","label":"Posición geográfica"},
    {"key":"condiciones_meteo","type":"text","label":"Condiciones hidrometeorológicas"},
    {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
    {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
    {"key":"hubo_heridos","type":"boolean","label":"Hubo heridos","triggers_record_type":"RO-07A"},
    {"key":"necesita_remolque","type":"boolean","label":"Necesita remolque","triggers_record_type":"RE-01R"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"},
    {"key":"firma_pd","type":"signature_block","label":"Persona Designada","signer_role":"persona_designada"}
  ]$j$::jsonb, 30);

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01C', 'Colisión',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"descripcion","type":"textarea","label":"Descripción del acaecimiento","required":true},
    {"key":"posicion","type":"text","label":"Posición geográfica"},
    {"key":"condiciones_meteo","type":"text","label":"Condiciones hidrometeorológicas"},
    {"key":"otro_buque_nombre","type":"text","label":"Otro buque / objeto involucrado"},
    {"key":"otro_buque_matricula","type":"text","label":"Matrícula del otro buque"},
    {"key":"otro_buque_bandera","type":"text","label":"Bandera del otro buque"},
    {"key":"danios_propios","type":"textarea","label":"Daños en el buque propio"},
    {"key":"danios_terceros","type":"textarea","label":"Daños a terceros"},
    {"key":"hay_via_agua","type":"boolean","label":"Hay vía de agua"},
    {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
    {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
    {"key":"hubo_heridos","type":"boolean","label":"Hubo heridos","triggers_record_type":"RO-07A"},
    {"key":"necesita_remolque","type":"boolean","label":"Necesita remolque","triggers_record_type":"RE-01R"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"},
    {"key":"firma_pd","type":"signature_block","label":"Persona Designada","signer_role":"persona_designada"}
  ]$j$::jsonb, 40, p_nota => 'Campos derivados del patrón de RE-01B más los datos propios de una colisión. A contrastar contra el formulario real.');

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01D', 'Incendio',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"descripcion","type":"textarea","label":"Descripción del siniestro","required":true},
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
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"}
  ]$j$::jsonb, 50);

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01E', 'Varadura',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"descripcion","type":"textarea","label":"Descripción del acaecimiento","required":true},
    {"key":"posicion","type":"text","label":"Posición geográfica"},
    {"key":"condiciones_meteo","type":"text","label":"Condiciones hidrometeorológicas"},
    {"key":"naturaleza_fondo","type":"select","label":"Naturaleza del fondo",
     "options":["Arena","Fango","Piedra","Roca","Mixto","Desconocida"]},
    {"key":"calados","type":"text","label":"Calados proa / popa"},
    {"key":"estado_marea","type":"select","label":"Estado de marea",
     "options":["Creciente","Bajante","Pleamar","Bajamar"]},
    {"key":"intentos_zafada","type":"textarea","label":"Maniobras de zafada intentadas"},
    {"key":"hay_via_agua","type":"boolean","label":"Hay vía de agua"},
    {"key":"hay_derrame","type":"boolean","label":"Hay derrame de hidrocarburos"},
    {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
    {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
    {"key":"hubo_heridos","type":"boolean","label":"Hubo heridos","triggers_record_type":"RO-07A"},
    {"key":"necesita_remolque","type":"boolean","label":"Necesita remolque","triggers_record_type":"RE-01R"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"},
    {"key":"firma_pd","type":"signature_block","label":"Persona Designada","signer_role":"persona_designada"}
  ]$j$::jsonb, 60, p_nota => 'Campos derivados del patrón de RE-01B más los datos propios de una varadura. A contrastar contra el formulario real.');

PERFORM pg_temp.seed_rt(p_pe01, 'RE-01R', 'Remolque de emergencia',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"motivo","type":"textarea","label":"Motivo del remolque","required":true},
    {"key":"rol","type":"select","label":"El buque actúa como","required":true,
     "options":["Remolcado","Remolcador"]},
    {"key":"otro_buque_nombre","type":"text","label":"Buque remolcador / remolcado","required":true},
    {"key":"otro_buque_matricula","type":"text","label":"Matrícula del otro buque"},
    {"key":"posicion_inicio","type":"text","label":"Posición al inicio del remolque"},
    {"key":"posicion_fin","type":"text","label":"Posición al finalizar / puerto de destino"},
    {"key":"hora_inicio","type":"datetime","label":"Inicio del remolque"},
    {"key":"hora_fin","type":"datetime","label":"Fin del remolque"},
    {"key":"elemento_remolque","type":"text","label":"Elemento de remolque empleado"},
    {"key":"condiciones_meteo","type":"text","label":"Condiciones hidrometeorológicas"},
    {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
    {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"},
    {"key":"firma_pd","type":"signature_block","label":"Persona Designada","signer_role":"persona_designada"}
  ]$j$::jsonb, 70, p_nota => 'Campos derivados de la descripción del relevamiento (posición geográfica y datos del buque remolcador/remolcado). A contrastar contra el formulario real.');

-- =========================================================================
-- PO-03 — Entrenamiento
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po03, 'RO-03A', 'Políticas y Familiarización con el SGS — Tripulante',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','persona_designada'], ARRAY['persona_designada'], 'ambas', '[]'::jsonb, 10);

PERFORM pg_temp.seed_rt(p_po03, 'RO-03B', 'Registro de Capacitación',
  'incident_event', 'vessel_optional', 'on_event', NULL,
  ARRAY['capitan','persona_designada','responsable_sh'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 20);

PERFORM pg_temp.seed_rt(p_po03, 'RO-03C', 'Políticas y Familiarización — Personal de tierra',
  'incident_event', 'company', 'on_event', NULL,
  ARRAY['persona_designada'], ARRAY['persona_designada'], 'ambas', '[]'::jsonb, 30);

PERFORM pg_temp.seed_rt(p_po03, 'RO-03D', 'Políticas de la Empresa — Personal Tercerizado',
  'incident_event', 'vessel_optional', 'on_event', NULL,
  ARRAY['capitan','persona_designada'], ARRAY['persona_designada'],
  'manuscrita', $j$[
    {"key":"empresa_prestadora","type":"text","label":"Empresa prestadora","required":true},
    {"key":"tarea","type":"text","label":"Tarea a realizar a bordo"},
    {"key":"personal","type":"table","label":"Personal alcanzado","required":true,
     "columns":[
       {"key":"nombre","type":"text","label":"Nombre y apellido"},
       {"key":"dni","type":"text","label":"DNI"},
       {"key":"fecha","type":"date","label":"Fecha"}]},
    {"key":"firma_responsable","type":"signature_block","label":"Responsable a bordo","signer_role":"capitan"}
  ]$j$::jsonb, 40);

-- =========================================================================
-- PM-04 — Mantenimiento
-- =========================================================================
PERFORM pg_temp.seed_rt(p_pm04, 'RM-04A', 'Pedido de reparaciones y/o mantenimiento — Puente / Cubierta',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','oficial_puente'], ARRAY['tecnica','armamento','persona_designada'],
  'configurable_por_firmante', $j$[
    {"key":"marea","type":"text","label":"Marea N°"},
    {"key":"trabajos","type":"table","label":"Trabajos solicitados","required":true,
     "columns":[
       {"key":"tipo","type":"select","label":"Tipo","options":["Reparación","Mantenimiento"]},
       {"key":"criticidad","type":"select","label":"Criticidad","options":["Crítico","No crítico"]},
       {"key":"descripcion","type":"text","label":"Descripción"}]},
    {"key":"firma_pedido","type":"signature_block","label":"Pedido por","signer_role":"solicitante"},
    {"key":"firma_recibido","type":"signature_block","label":"Recibido por","signer_role":"tierra"},
    {"key":"firma_conforme","type":"signature_block","label":"Conforme","signer_role":"solicitante"}
  ]$j$::jsonb, 10);

PERFORM pg_temp.seed_rt(p_pm04, 'RM-04B', 'Pedido de Materiales',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','jefe_maquinas','oficial_puente','oficial_maquinas'],
  ARRAY['armamento','persona_designada'], 'configurable_por_firmante',
  $j$[
    {"key":"marea","type":"text","label":"Marea N°"},
    {"key":"sector","type":"select","label":"Sector","required":true,
     "options":["Puente","Cubierta","Máquina","Técnica/Armamento"]},
    {"key":"items","type":"table","label":"Ítems solicitados","required":true,
     "columns":[
       {"key":"cantidad_pedida","type":"number","label":"Cant. pedida"},
       {"key":"urgencia","type":"select","label":"Urgencia","options":["Normal","Urgente"]},
       {"key":"descripcion","type":"text","label":"Descripción"},
       {"key":"cantidad_recibida","type":"number","label":"Cant. recibida"}]},
    {"key":"firma_pedido","type":"signature_block","label":"Pedido por","signer_role":"solicitante"},
    {"key":"firma_recibido","type":"signature_block","label":"Recibido por","signer_role":"tierra"},
    {"key":"firma_conforme","type":"signature_block","label":"Conforme","signer_role":"solicitante"}
  ]$j$::jsonb, 20);

PERFORM pg_temp.seed_rt(p_pm04, 'RM-04C', 'Pedido de reparaciones y/o mantenimiento — Máquinas / Técnica',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['jefe_maquinas','oficial_maquinas'], ARRAY['tecnica','persona_designada'],
  'configurable_por_firmante', $j$[
    {"key":"marea","type":"text","label":"Marea N°"},
    {"key":"combustible_abordo","type":"number","label":"Combustible a bordo (l)"},
    {"key":"aceite_abordo","type":"number","label":"Aceite a bordo (l)"},
    {"key":"horometros","type":"table","label":"Horómetros",
     "columns":[
       {"key":"equipo","type":"text","label":"Equipo"},
       {"key":"horas","type":"number","label":"Horas"}]},
    {"key":"trabajos","type":"table","label":"Trabajos solicitados","required":true,
     "columns":[
       {"key":"tipo","type":"select","label":"Tipo","options":["Reparación","Mantenimiento"]},
       {"key":"criticidad","type":"select","label":"Criticidad","options":["Crítico","No crítico"]},
       {"key":"descripcion","type":"text","label":"Descripción"}]},
    {"key":"firma_pedido","type":"signature_block","label":"Pedido por","signer_role":"solicitante"},
    {"key":"firma_recibido","type":"signature_block","label":"Recibido por","signer_role":"tierra"},
    {"key":"firma_conforme","type":"signature_block","label":"Conforme","signer_role":"solicitante"}
  ]$j$::jsonb, 30);

PERFORM pg_temp.seed_rt(p_pm04, 'PM-04-ANEXO-A', 'Plan de mantenimiento — equipos críticos',
  'master_data', 'vessel', 'none', NULL,
  ARRAY['jefe_maquinas','tecnica'], ARRAY['tecnica','persona_designada'], 'none', '[]'::jsonb, 40);

PERFORM pg_temp.seed_rt(p_pm04, 'PM-04-ANEXO-B', 'Plan de mantenimiento preventivo — motores y equipos varios',
  'scheduled_checklist', 'vessel', 'monthly', NULL,
  ARRAY['jefe_maquinas','oficial_maquinas'], ARRAY['tecnica','persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 50);

-- =========================================================================
-- PO-05 — Operaciones de a bordo
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po05, 'RO-05A', 'Cambio de guardia — Puente / Sala de Máquinas',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['oficial_puente','oficial_maquinas'], ARRAY['capitan','persona_designada'],
  'pin', '[]'::jsonb, 10);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05B', 'Controles durante la navegación',
  'scheduled_checklist', 'vessel', 'daily', NULL,
  ARRAY['oficial_puente','oficial_maquinas'], ARRAY['capitan','persona_designada'],
  'pin', '[]'::jsonb, 20);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05C', 'Controles previos a zarpada y arribo',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 30);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05D', 'Maniobra de atraque / desatraque',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 40);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05E', 'Desembarco y trasbordo de tripulantes',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 50);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05F', 'Navegación en condiciones climáticas normales y adversas',
  'scheduled_checklist', 'vessel', 'daily', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 60);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05G', 'Control de tareas operacionales en alistamiento (carga / descarga)',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 70);
PERFORM pg_temp.seed_rt(p_po05, 'RO-05R', 'Controles de remolque de emergencia',
  'scheduled_checklist', 'vessel', 'on_event', NULL,
  ARRAY['capitan'], ARRAY['persona_designada'], 'configurable_por_firmante', '[]'::jsonb, 80);

-- Registro "hijo" genérico: cualquier checklist de PO-05 con un ítem no conforme
-- genera una instancia de este tipo, enlazada por parent_record_instance_id.
PERFORM pg_temp.seed_rt(p_po05, 'RO-05-ANEXO', 'Registro de desvíos de listas de comprobación',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','oficial_puente','oficial_maquinas'], ARRAY['persona_designada'],
  'configurable_por_firmante', $j$[
    {"key":"checklist_origen","type":"text","label":"Lista de comprobación de origen","required":true},
    {"key":"item_no_conforme","type":"textarea","label":"Ítem incumplido","required":true},
    {"key":"descripcion","type":"textarea","label":"Descripción del desvío","required":true},
    {"key":"accion_tomada","type":"textarea","label":"Acción tomada"},
    {"key":"firma_informa","type":"signature_block","label":"Informa","signer_role":"informa"},
    {"key":"firma_recibe","type":"signature_block","label":"Recibe","signer_role":"recibe"}
  ]$j$::jsonb, 90);

-- =========================================================================
-- PA-06 — Auditorías y no conformidades
-- =========================================================================
PERFORM pg_temp.seed_rt(p_pa06, 'RA-06A', 'Auditoría Interna',
  'management_review', 'vessel_optional', 'fixed_interval_days', 365,
  ARRAY['auditor_interno','persona_designada','asesor_externo'],
  ARRAY['persona_designada','apoderado'], 'manuscrita', '[]'::jsonb, 10);

PERFORM pg_temp.seed_rt(p_pa06, 'RA-06B', 'Informe de Revisión Anual del SGS',
  'management_review', 'company', 'fixed_interval_days', 365,
  ARRAY['persona_designada','apoderado','asesor_externo'], ARRAY['apoderado'],
  'manuscrita', '[]'::jsonb, 20);

-- Se mantiene en el catálogo por trazabilidad documental, pero el dato lo calcula
-- la vista v_record_compliance: es un reporte, no un formulario a completar.
PERFORM pg_temp.seed_rt(p_pa06, 'RA-06C', 'Monitoreo y Control del SGS',
  'management_review', 'company', 'monthly', NULL,
  ARRAY['persona_designada','tecnica'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 30);

PERFORM pg_temp.seed_rt(p_pa06, 'RA-06-NNC', 'Nota de No Conformidad',
  'incident_event', 'vessel_optional', 'on_event', NULL,
  ARRAY['apoderado','tecnica','armamento','persona_designada','capitan','auditor_interno'],
  ARRAY['persona_designada','apoderado'], 'configurable_por_firmante',
  $j$[
    {"key":"origen","type":"select","label":"Origen del hallazgo","required":true,
     "options":["Auditoría interna","Auditoría externa","Inspección PNA","Observación operativa","Otro"]},
    {"key":"procedimiento_afectado","type":"text","label":"Procedimiento / registro afectado"},
    {"key":"descripcion","type":"textarea","label":"Descripción de la no conformidad","required":true},
    {"key":"accion_correctiva","type":"textarea","label":"Acción correctiva propuesta"},
    {"key":"responsable","type":"user_reference","label":"Responsable de la acción"},
    {"key":"plazo","type":"date","label":"Plazo de cierre"},
    {"key":"firma_emisor","type":"signature_block","label":"Emisor","signer_role":"emisor"}
  ]$j$::jsonb, 40);

-- =========================================================================
-- PO-07 — Accidentes e incidentes
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po07, 'RO-07A', 'Acaecimiento Médico / Investigación de accidentes',
  'incident_event', 'vessel', 'on_event', NULL,
  ARRAY['capitan','oficial_puente','persona_designada'],
  ARRAY['persona_designada','responsable_sh'], 'configurable_por_firmante',
  $j$[
    {"key":"tripulante","type":"user_reference","label":"Tripulante afectado"},
    {"key":"tripulante_nombre","type":"text","label":"Nombre (si no está en el sistema)"},
    {"key":"puesto","type":"text","label":"Puesto a bordo"},
    {"key":"fecha_hecho","type":"datetime","label":"Fecha y hora del hecho","required":true},
    {"key":"descripcion","type":"textarea","label":"Descripción del hecho","required":true},
    {"key":"sintomas","type":"textarea","label":"Síntomas / lesiones"},
    {"key":"riesgo","type":"risk_reference","label":"Cuadro de la matriz de riesgo aplicable"},
    {"key":"informa_compania","type":"boolean","label":"Se informa a Compañía"},
    {"key":"informa_pna","type":"boolean","label":"Se informa a PNA"},
    {"key":"medidas_correctivas","type":"table","label":"Plan de medidas correctivas",
     "columns":[
       {"key":"medida","type":"text","label":"Medida"},
       {"key":"responsable","type":"text","label":"Responsable"},
       {"key":"plazo","type":"date","label":"Plazo"}]},
    {"key":"firma_capitan","type":"signature_block","label":"Capitán","signer_role":"capitan"},
    {"key":"firma_pd","type":"signature_block","label":"Persona Designada","signer_role":"persona_designada"}
  ]$j$::jsonb, 10);

PERFORM pg_temp.seed_rt(p_po07, 'RO-07C', 'Accidentes y cuasi accidentes (buque, terceros, medioambiente)',
  'incident_event', 'vessel_optional', 'on_event', NULL,
  ARRAY['capitan','persona_designada'], ARRAY['persona_designada','responsable_sh'],
  'configurable_por_firmante', '[]'::jsonb, 20);

-- =========================================================================
-- PO-08 — Riesgo
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po08, 'PO-08-ANEXO', 'Matriz de Evaluación de Riesgos',
  'risk_assessment', 'company', 'none', NULL,
  ARRAY['responsable_sh'], ARRAY['persona_designada'], 'none', '[]'::jsonb, 10);

PERFORM pg_temp.seed_rt(p_po08, 'RO-08', 'Registro de análisis y mitigación de riesgo',
  'risk_assessment', 'vessel_optional', 'on_event', NULL,
  ARRAY['responsable_sh','persona_designada'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 20);

-- =========================================================================
-- PO-09 — EPP
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po09, 'RO-09', 'Entrega de Elementos de Protección Personal',
  'incident_event', 'vessel_optional', 'on_event', NULL,
  ARRAY['capitan','armamento','responsable_sh'], ARRAY['persona_designada','responsable_sh'],
  'manuscrita', $j$[
    {"key":"trabajador","type":"user_reference","label":"Trabajador que recibe"},
    {"key":"trabajador_nombre","type":"text","label":"Nombre (si no está en el sistema)"},
    {"key":"puesto","type":"select","label":"Puesto",
     "options":["Puente","Cubierta","Máquinas","Cocina"]},
    {"key":"elementos","type":"table","label":"Elementos entregados","required":true,
     "columns":[
       {"key":"producto","type":"text","label":"Producto"},
       {"key":"tipo_modelo","type":"text","label":"Tipo / modelo"},
       {"key":"marca","type":"text","label":"Marca"},
       {"key":"certificacion","type":"text","label":"Certificación"},
       {"key":"cantidad","type":"number","label":"Cantidad"},
       {"key":"fecha","type":"date","label":"Fecha"}]},
    {"key":"firma_trabajador","type":"signature_block","label":"Recibe conforme","signer_role":"recibe"}
  ]$j$::jsonb, 10);

-- =========================================================================
-- PO-10 — Buques inactivos
-- =========================================================================
PERFORM pg_temp.seed_rt(p_po10, 'RO-10A', 'Verificación de condiciones — Buque Inactivo',
  'inactive_vessel', 'vessel', 'monthly', NULL,
  ARRAY['capitan','tecnica','persona_designada'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 10);

PERFORM pg_temp.seed_rt(p_po10, 'RO-10B', 'Dotación suficiente de guardia en puerto',
  'inactive_vessel', 'vessel', 'on_event', NULL,
  ARRAY['capitan','persona_designada'], ARRAY['persona_designada'],
  'configurable_por_firmante', '[]'::jsonb, 20);

PERFORM pg_temp.seed_rt(p_po10, 'RO-10C', 'Verificación de Buque en Puerto',
  'inactive_vessel', 'vessel', 'daily', NULL,
  ARRAY['guardia_puerto','capitan'], ARRAY['persona_designada'], 'pin',
  $j$[
    {"key":"fecha","type":"date","label":"Fecha","required":true},
    {"key":"amarras_ok","type":"boolean","label":"Amarras en condición","required":true},
    {"key":"achique_ok","type":"boolean","label":"Sistema de achique operativo","required":true},
    {"key":"acceso_ok","type":"boolean","label":"Acceso restringido / planchada segura","required":true},
    {"key":"novedades","type":"textarea","label":"Novedades"},
    {"key":"firma_guardia","type":"signature_block","label":"Guardia","signer_role":"guardia_puerto"}
  ]$j$::jsonb, 30);

RAISE NOTICE 'Catálogo de referencia cargado para company_id %', v_company;
END $seed$;

COMMIT;
