-- 001_platform_roles.sql
-- Catálogo base de roles de la plataforma (company_id NULL).
-- Cada empresa puede agregar los suyos sin tocar esta lista.

INSERT INTO roles (code, name, is_shipboard, exclusive_per_vessel, can_manage_catalog, description) VALUES
  ('capitan',            'Capitán',                          true,  true, false,  'Máxima autoridad a bordo; firma la mayoría de los registros operativos'),
  ('jefe_maquinas',      'Jefe de Máquinas',                 true,  true, false,  'Responsable de máquinas; firma RM-04C y planes de mantenimiento'),
  ('primer_of_maquinas', 'Primer Oficial de Máquinas',       true,  false, false, NULL),
  ('oficial',            'Oficial de guardia',               true,  false, false, 'Firma cambios de guardia y controles de navegación'),
  ('tripulante',         'Tripulante',                       true,  false, false, NULL),
  ('persona_designada',  'Persona Designada (PD)',           false, false, true,  'Nexo buque-empresa ante PNA; revisa y aprueba registros'),
  ('armador',            'Armador / Apoderado',              false, false, true,  NULL),
  ('responsable_sh',     'Responsable de Seguridad e Higiene', false, false, false, 'Titular de la matriz de riesgo (PO-08)'),
  ('area_tecnica',       'Área Técnica / Armamento',         false, false, false, NULL),
  ('asesor_externo',     'Asesor externo',                   false, false, true,  'Opera sobre varias compañías; revisa registros'),
  ('auditor',            'Auditor',                          false, false, false, NULL),
  ('admin_plataforma',   'Administrador de plataforma',      false, false, true,  NULL),
  ('personal_tierra',    'Personal de tierra',               false, false, false, NULL),
  ('contratista',        'Personal tercerizado',             false, false, false, NULL),
  ('guardia_puerto',     'Guardia / sereno en puerto',       false, false, false, 'Firma RO-10C mientras el buque está retirado de servicio')
ON CONFLICT (code) DO NOTHING;

-- Roles de acto de firma: no son puestos, son el rol con el que se firma un
-- punto del formulario (entrega/recibe, saliente/entrante, pedido/conforme).
INSERT INTO roles (code, name, is_shipboard, exclusive_per_vessel, can_manage_catalog, description) VALUES
  ('entrega',        'Entrega',        false, false, false, 'Rol de firma (RMGS-03)'),
  ('recibe',         'Recibe',         false, false, false, 'Rol de firma (RMGS-03)'),
  ('mando_saliente', 'Mando saliente', false, false, false, 'Rol de firma (RMGS-02)'),
  ('mando_entrante', 'Mando entrante', false, false, false, 'Rol de firma (RMGS-02)'),
  ('informa',        'Informa',        false, false, false, 'Rol de firma (RO-05 Anexo)'),
  ('solicitante',    'Solicitante',    false, false, false, 'Rol de firma (RM-04)'),
  ('conforme',       'Conforme',       false, false, false, 'Rol de firma (RM-04)')
ON CONFLICT (code) DO NOTHING;

-- El seed es idempotente: si los roles ya existían, se refresca el permiso de
-- administración (la migración 0009 no puede hacerlo porque corre antes).
UPDATE roles SET can_manage_catalog = true
 WHERE company_id IS NULL
   AND code IN ('armador', 'persona_designada', 'admin_plataforma', 'asesor_externo');
