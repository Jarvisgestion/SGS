-- 0001_helpers.sql
-- Extensiones, funciones auxiliares y validadores compartidos por el resto del esquema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gin;  -- índices combinados jsonb + escalares
CREATE EXTENSION IF NOT EXISTS citext;      -- emails case-insensitive

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tablas append-only (audit_log, signatures): se prohíbe UPDATE/DELETE a nivel
-- de base para que la trazabilidad exigida por PNA no dependa del backend.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % es append-only: % no está permitido',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- ---------------------------------------------------------------------------
-- Validación estructural de record_types.field_schema
--
-- Es una función PURA (no toca tablas) para poder usarse en un CHECK.
-- Las validaciones que requieren cruzar con otras tablas (que el signer_role
-- exista en `roles`, que triggers_record_type apunte a un código real) van en
-- triggers, ver 0004_catalog.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sgs_field_types() RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT ARRAY[
    'text', 'textarea', 'number', 'date', 'time', 'datetime',
    'select', 'multiselect', 'boolean', 'checklist', 'table',
    'signature_block', 'file', 'risk_reference', 'user_reference'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION sgs_validate_field_schema(schema jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  field   jsonb;
  col     jsonb;
  fkey    text;
  ftype   text;
  seen    text[] := ARRAY[]::text[];
  colseen text[];
BEGIN
  IF schema IS NULL THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(schema) <> 'array' THEN
    RAISE EXCEPTION 'field_schema debe ser un array JSON, se recibió %', jsonb_typeof(schema);
  END IF;

  FOR field IN SELECT * FROM jsonb_array_elements(schema) LOOP
    IF jsonb_typeof(field) <> 'object' THEN
      RAISE EXCEPTION 'Cada campo de field_schema debe ser un objeto JSON';
    END IF;

    fkey  := field ->> 'key';
    ftype := field ->> 'type';

    IF fkey IS NULL OR fkey !~ '^[a-z][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'Clave de campo inválida (%): debe ser snake_case', coalesce(fkey, '<null>');
    END IF;
    IF fkey = ANY (seen) THEN
      RAISE EXCEPTION 'Clave de campo duplicada en field_schema: %', fkey;
    END IF;
    seen := seen || fkey;

    IF ftype IS NULL OR NOT (ftype = ANY (sgs_field_types())) THEN
      RAISE EXCEPTION 'Tipo de campo desconocido (%) en el campo %', coalesce(ftype, '<null>'), fkey;
    END IF;

    -- Campos con opciones cerradas
    IF ftype IN ('select', 'multiselect', 'checklist') THEN
      IF coalesce(jsonb_typeof(field -> 'options'), '') <> 'array'
         OR jsonb_array_length(field -> 'options') = 0 THEN
        RAISE EXCEPTION 'El campo % de tipo % requiere "options" no vacío', fkey, ftype;
      END IF;
    END IF;

    -- Campo tabla: filas repetibles (RM-04B, RO-03D, RMGS-03, RO-09)
    IF ftype = 'table' THEN
      IF coalesce(jsonb_typeof(field -> 'columns'), '') <> 'array'
         OR jsonb_array_length(field -> 'columns') = 0 THEN
        RAISE EXCEPTION 'El campo tabla % requiere "columns" no vacío', fkey;
      END IF;
      colseen := ARRAY[]::text[];
      FOR col IN SELECT * FROM jsonb_array_elements(field -> 'columns') LOOP
        IF (col ->> 'key') IS NULL OR (col ->> 'key') !~ '^[a-z][a-z0-9_]*$' THEN
          RAISE EXCEPTION 'Columna inválida en la tabla %: key debe ser snake_case', fkey;
        END IF;
        IF (col ->> 'key') = ANY (colseen) THEN
          RAISE EXCEPTION 'Columna duplicada % en la tabla %', col ->> 'key', fkey;
        END IF;
        colseen := colseen || (col ->> 'key');
        IF (col ->> 'type') IS NULL OR NOT ((col ->> 'type') = ANY (sgs_field_types())) THEN
          RAISE EXCEPTION 'Tipo de columna desconocido (%) en la tabla %', coalesce(col ->> 'type', '<null>'), fkey;
        END IF;
        IF (col ->> 'type') IN ('table', 'signature_block') THEN
          RAISE EXCEPTION 'Una tabla no puede anidar columnas de tipo % (campo %)', col ->> 'type', fkey;
        END IF;
      END LOOP;
    END IF;

    -- Bloque de firma: siempre declara con qué rol se firma ese punto del formulario
    IF ftype = 'signature_block' AND (field ->> 'signer_role') IS NULL THEN
      RAISE EXCEPTION 'El campo % de tipo signature_block requiere "signer_role"', fkey;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;
