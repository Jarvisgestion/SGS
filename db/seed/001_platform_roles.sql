-- 001_platform_roles.sql
-- Catálogo base de roles de la plataforma (company_id NULL).
-- Cada empresa puede agregar los suyos sin tocar esta lista.

INSERT INTO roles (code, name, is_shipboard, exclusive_per_vessel, description) VALUES
  ('capitan',            'Capitán',                          true,  true,  'Máxima autoridad a bordo; firma la mayoría de los registros operativos'),
  ('jefe_maquinas',      'Jefe de Máquinas',                 true,  true,  'Responsable de máquinas; firma RM-04C y planes de mantenimiento'),
  ('primer_of_maquinas', 'Primer Oficial de Máquinas',       true,  false, NULL),
  ('oficial',            'Oficial de guardia',               true,  false, 'Firma cambios de guardia y controles de navegación'),
  ('tripulante',         'Tripulante',                       true,  false, NULL),
  ('persona_designada',  'Persona Designada (PD)',           false, false, 'Nexo buque-empresa ante PNA; revisa y aprueba registros'),
  ('armador',            'Armador / Apoderado',              false, false, NULL),
  ('responsable_sh',     'Responsable de Seguridad e Higiene', false, false, 'Titular de la matriz de riesgo (PO-08)'),
  ('area_tecnica',       'Área Técnica / Armamento',         false, false, NULL),
  ('asesor_externo',     'Asesor externo',                   false, false, 'Opera sobre varias compañías; revisa registros'),
  ('auditor',            'Auditor',                          false, false, NULL),
  ('admin_plataforma',   'Administrador de plataforma',      false, false, NULL),
  ('personal_tierra',    'Personal de tierra',               false, false, NULL),
  ('contratista',        'Personal tercerizado',             false, false, NULL),
  ('guardia_puerto',     'Guardia / sereno en puerto',       false, false, 'Firma RO-10C mientras el buque está retirado de servicio')
ON CONFLICT (code) DO NOTHING;

-- Roles de acto de firma: no son puestos, son el rol con el que se firma un
-- punto del formulario (entrega/recibe, saliente/entrante, pedido/conforme).
INSERT INTO roles (code, name, is_shipboard, exclusive_per_vessel, description) VALUES
  ('entrega',        'Entrega',        false, false, 'Rol de firma (RMGS-03)'),
  ('recibe',         'Recibe',         false, false, 'Rol de firma (RMGS-03)'),
  ('mando_saliente', 'Mando saliente', false, false, 'Rol de firma (RMGS-02)'),
  ('mando_entrante', 'Mando entrante', false, false, 'Rol de firma (RMGS-02)'),
  ('informa',        'Informa',        false, false, 'Rol de firma (RO-05 Anexo)'),
  ('solicitante',    'Solicitante',    false, false, 'Rol de firma (RM-04)'),
  ('conforme',       'Conforme',       false, false, 'Rol de firma (RM-04)')
ON CONFLICT (code) DO NOTHING;
