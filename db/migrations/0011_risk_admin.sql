-- 0011_risk_admin.sql
-- Quién mantiene la matriz de riesgo (PO-08).
--
-- Se separa de can_manage_catalog porque son cosas distintas: el manual lo
-- edita la Persona Designada o el armador, mientras que la matriz es del
-- Responsable de Seguridad e Higiene, que no necesariamente administra el resto.

ALTER TABLE roles ADD COLUMN can_manage_risk boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN roles.can_manage_risk IS
  'El rol puede cargar y revisar la matriz de evaluación de riesgos de su empresa.';

UPDATE roles SET can_manage_risk = true
 WHERE code IN ('responsable_sh', 'persona_designada', 'armador', 'admin_plataforma', 'asesor_externo');

CREATE OR REPLACE FUNCTION sgs_check_risk_admin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := sgs_current_actor();
  cid   uuid := COALESCE(NEW.company_id, OLD.company_id);
BEGIN
  -- Sin actor declarado (migraciones, seeds) no hay a quién pedirle permiso.
  IF actor IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.code = ur.role_code
     WHERE ur.user_id = actor
       AND ur.company_id = cid
       AND ur.valid_from <= current_date
       AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)
       AND r.can_manage_risk
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un rol habilitado para editar la matriz de riesgo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER risk_assessments_admin BEFORE INSERT OR UPDATE OR DELETE ON risk_assessments
  FOR EACH ROW EXECUTE FUNCTION sgs_check_risk_admin();
