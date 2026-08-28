-- 0008_reviewer_roles.sql
-- Simetría con allowed_creator_roles: quién puede aprobar/observar también se
-- verifica en la base, no sólo en la API.

CREATE OR REPLACE FUNCTION sgs_check_reviewer_role() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rt    record_types%ROWTYPE;
  inst  record_instances%ROWTYPE;
  roles_ text[];
BEGIN
  IF NEW.reviewer_id IS NULL THEN
    RETURN NEW;   -- revisión asentada sin usuario (migración de datos históricos)
  END IF;

  SELECT * INTO inst FROM record_instances WHERE id = NEW.record_instance_id;
  SELECT * INTO rt   FROM record_types     WHERE id = inst.record_type_id;

  IF array_length(rt.allowed_reviewer_roles, 1) IS NULL THEN
    RETURN NEW;   -- sin restricción declarada
  END IF;

  roles_ := sgs_user_role_codes(NEW.reviewer_id, inst.vessel_id, NEW.reviewed_at::date);
  IF NOT (roles_ && rt.allowed_reviewer_roles) THEN
    RAISE EXCEPTION 'El usuario no tiene un rol habilitado para revisar % (habilitados: %)',
      rt.code, array_to_string(rt.allowed_reviewer_roles, ', ')
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER record_reviews_check_role BEFORE INSERT ON record_reviews
  FOR EACH ROW EXECUTE FUNCTION sgs_check_reviewer_role();
