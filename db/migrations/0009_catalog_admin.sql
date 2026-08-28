-- 0009_catalog_admin.sql
-- Quién puede editar el catálogo de su empresa (manual, procedimientos, tipos
-- de registro, buques). Misma idea que allowed_creator_roles: la regla vive en
-- la base, no en la API.

ALTER TABLE roles ADD COLUMN can_manage_catalog boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN roles.can_manage_catalog IS
  'El rol puede editar el catálogo de su empresa (manual, procedimientos, tipos de registro, buques).';

UPDATE roles SET can_manage_catalog = true
 WHERE code IN ('armador', 'persona_designada', 'admin_plataforma', 'asesor_externo');

-- ---------------------------------------------------------------------------
-- Verificación
--
-- Cuando no hay actor declarado (migraciones, seeds, scripts de carga) no se
-- verifica nada: no hay usuario a quien pedirle permiso. La API siempre declara
-- el actor con SET LOCAL sgs.actor_user_id, así que toda escritura que venga de
-- una persona sí pasa por acá.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_assert_can_manage_catalog(p_company_id uuid, p_que text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actor uuid := sgs_current_actor();
BEGIN
  IF actor IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM user_roles ur
      JOIN roles r ON r.code = ur.role_code
     WHERE ur.user_id = actor
       AND ur.company_id = p_company_id
       AND ur.valid_from <= current_date
       AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)
       AND r.can_manage_catalog
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un rol habilitado para editar % de esta empresa', p_que
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sgs_check_catalog_admin() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  fila jsonb := to_jsonb(COALESCE(NEW, OLD));
  cid  uuid;
BEGIN
  cid := (fila ->> 'company_id')::uuid;

  -- manual_versions y vessels llevan company_id propio; procedures y
  -- record_types también (columna desnormalizada para las FK compuestas).
  IF cid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM sgs_assert_can_manage_catalog(cid, TG_ARGV[0]);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER manual_versions_admin BEFORE INSERT OR UPDATE OR DELETE ON manual_versions
  FOR EACH ROW EXECUTE FUNCTION sgs_check_catalog_admin('el manual');
CREATE TRIGGER procedures_admin BEFORE INSERT OR UPDATE OR DELETE ON procedures
  FOR EACH ROW EXECUTE FUNCTION sgs_check_catalog_admin('los procedimientos');
CREATE TRIGGER record_types_admin BEFORE INSERT OR UPDATE OR DELETE ON record_types
  FOR EACH ROW EXECUTE FUNCTION sgs_check_catalog_admin('los tipos de registro');
CREATE TRIGGER vessels_admin BEFORE INSERT OR UPDATE OR DELETE ON vessels
  FOR EACH ROW EXECUTE FUNCTION sgs_check_catalog_admin('la flota');
