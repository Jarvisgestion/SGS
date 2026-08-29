-- 0014_search_path_funciones.sql
--
-- Las funciones no tenían search_path propio, y eso rompía la restauración de
-- un resguardo.
--
-- pg_restore vacía el search_path a propósito (`set_config('search_path','',false)`)
-- para que restaurar un dump ajeno no ejecute código inesperado. Con el
-- search_path vacío, una función que llama a otra sin calificar no la
-- encuentra. El CHECK de record_types.field_schema llama a
-- sgs_validate_field_schema, que a su vez llama a sgs_field_types: al cargar los
-- datos fallaba, y la restauración terminaba con tablas vacías.
--
-- Fijarle a cada función su search_path lo resuelve, y de paso es la práctica
-- recomendada: la función deja de depender de con qué search_path la llamen.
--
-- IMPORTANTE: toda función nueva tiene que declararlo igual. Ver db/README.md.

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       -- Las funciones de las extensiones (pgcrypto, citext) no se tocan.
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = p.oid AND d.deptype = 'e'
       )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', f.firma);
  END LOOP;
END $$;
