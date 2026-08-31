-- 0007_rls.sql
-- Aislamiento multi-empresa a nivel de motor. La app se conecta con el rol sgs_app
-- (que NO es dueño de las tablas, así RLS sí lo alcanza) y en cada request hace:
--   SET LOCAL sgs.current_company_id = '<uuid>';
--   SET LOCAL sgs.current_user_id    = '<uuid>';
-- Un bug de la aplicación que olvide filtrar por company_id no puede filtrar datos
-- de otra empresa: sin el setting, las políticas no devuelven ninguna fila.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sgs_app') THEN
    CREATE ROLE sgs_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO sgs_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sgs_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sgs_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sgs_app;

-- El asesor externo / admin opera sobre varias empresas: la app fija el settingpor
-- empresa activa, y este flag habilita las tareas de plataforma puntuales.
CREATE OR REPLACE FUNCTION sgs_rls_visible(p_company_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('sgs.bypass_rls', true) = 'on', false)
      OR p_company_id = sgs_current_company_id();
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vessels','vessel_certificates','manual_versions','procedures','record_types',
    'record_type_versions','record_instances','record_reviews','signatures',
    'attachments','risk_assessments','user_roles'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (sgs_rls_visible(company_id))
         WITH CHECK (sgs_rls_visible(company_id))', t, t);
  END LOOP;
END $$;

-- companies: cada quien ve la suya (id es su propio company_id).
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_tenant_isolation ON companies
  USING (sgs_rls_visible(id)) WITH CHECK (sgs_rls_visible(id));

-- users: los de la empresa, más los multi-empresa (company_id NULL: asesores).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_isolation ON users
  USING (company_id IS NULL OR sgs_rls_visible(company_id))
  WITH CHECK (company_id IS NULL OR sgs_rls_visible(company_id));

-- audit_log: legible por la empresa, nunca modificable (ya hay trigger append-only).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING (company_id IS NULL OR sgs_rls_visible(company_id))
  WITH CHECK (company_id IS NULL OR sgs_rls_visible(company_id));

-- roles y certificate_types: catálogo global + el propio de la empresa.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
  USING (company_id IS NULL OR sgs_rls_visible(company_id))
  WITH CHECK (company_id IS NOT NULL AND sgs_rls_visible(company_id));

ALTER TABLE certificate_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY certificate_types_tenant_isolation ON certificate_types
  USING (company_id IS NULL OR sgs_rls_visible(company_id))
  WITH CHECK (company_id IS NOT NULL AND sgs_rls_visible(company_id));

COMMENT ON FUNCTION sgs_rls_visible(uuid) IS
  'Política de visibilidad multi-tenant. Sin sgs.current_company_id seteado no se ve nada.';
