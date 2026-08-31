-- 0008_auth_functions.sql
--
-- El login es anterior a saber de qué empresa es el usuario, así que la política
-- de RLS sobre `users` lo deja invisible: sin sgs.current_company_id no hay filas.
-- Estas dos funciones son la única puerta que atraviesa RLS, y lo hacen a
-- propósito, devolviendo el mínimo necesario para autenticar.
--
-- Nota de endurecimiento para producción: en desarrollo estas funciones quedan a
-- nombre del dueño del esquema. Conviene que ese dueño sea un rol dedicado sin
-- superusuario, para que SECURITY DEFINER no otorgue más de lo necesario.

CREATE OR REPLACE FUNCTION sgs_auth_by_email(p_email text)
RETURNS TABLE (id uuid, password_hash text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.password_hash, u.status
  FROM users u
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

COMMENT ON FUNCTION sgs_auth_by_email(text) IS
  'Búsqueda de credenciales para el login. Devuelve solo lo necesario para '
  'verificar la contraseña, nunca el resto del perfil.';

CREATE OR REPLACE FUNCTION sgs_auth_by_id(p_user_id uuid)
RETURNS TABLE (
  id uuid, company_id uuid, full_name text, email text,
  default_vessel_id uuid, roles text[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.company_id, u.full_name, u.email, u.default_vessel_id,
         sgs_user_role_codes(u.id)
  FROM users u
  WHERE u.id = p_user_id AND u.status = 'activo';
$$;

COMMENT ON FUNCTION sgs_auth_by_id(uuid) IS
  'Perfil del portador de un token de sesión, para poder fijar el contexto de '
  'empresa con el que se abrirá la transacción.';

REVOKE ALL ON FUNCTION sgs_auth_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION sgs_auth_by_id(uuid)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sgs_auth_by_email(text) TO sgs_app;
GRANT EXECUTE ON FUNCTION sgs_auth_by_id(uuid)  TO sgs_app;
