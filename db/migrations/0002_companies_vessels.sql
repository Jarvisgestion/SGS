-- 0002_companies_vessels.sql
-- Empresas, buques y certificados de buque (RMGS-04 y RMGS-05).

CREATE TYPE entity_status AS ENUM ('activo', 'inactivo');
CREATE TYPE vessel_status AS ENUM ('activo', 'inactivo', 'retirado_de_servicio');
CREATE TYPE certificate_status AS ENUM ('vigente', 'por_vencer', 'vencido');

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
CREATE TABLE companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  cuit                text,
  fiscal_address      text,
  operational_address text,
  contact_emails      text[] NOT NULL DEFAULT '{}',
  status              entity_status NOT NULL DEFAULT 'activo',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT companies_cuit_format CHECK (cuit IS NULL OR cuit ~ '^[0-9]{2}-?[0-9]{8}-?[0-9]$')
);
CREATE UNIQUE INDEX companies_cuit_key ON companies (cuit) WHERE cuit IS NOT NULL;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- ---------------------------------------------------------------------------
-- vessels  (RMGS-04 "Flota de Buques y matrículas")
--
-- `specs` va en jsonb: la ficha técnica varía por tipo de buque y no justifica
-- una migración cada vez que cambia un dato técnico secundario.
-- ---------------------------------------------------------------------------
CREATE TABLE vessels (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  name               text NOT NULL,
  matricula          text NOT NULL,
  omi                text,
  vessel_type        text,               -- "buque motor"
  service            text,               -- "pesquero"
  specific_operation text,               -- "arrastrero", "poteros", ...
  specs              jsonb NOT NULL DEFAULT '{}'::jsonb,
  status             vessel_status NOT NULL DEFAULT 'activo',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessels_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT vessels_specs_is_object CHECK (jsonb_typeof(specs) = 'object'),
  -- clave alternativa para FKs compuestas: garantiza a nivel de base que ninguna
  -- fila operativa referencie un buque de otra empresa (aislamiento multi-tenant)
  CONSTRAINT vessels_id_company_key UNIQUE (id, company_id)
);
CREATE UNIQUE INDEX vessels_company_matricula_key ON vessels (company_id, upper(matricula));
CREATE INDEX vessels_company_status_idx ON vessels (company_id, status);
CREATE TRIGGER vessels_set_updated_at BEFORE UPDATE ON vessels
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- ---------------------------------------------------------------------------
-- vessel_certificate_types
--
-- El listado de ~25 certificados de RMGS-05 NO se hardcodea: es catálogo
-- editable por empresa (company_id NULL = catálogo base de la plataforma).
-- ---------------------------------------------------------------------------
CREATE TABLE vessel_certificate_types (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies (id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  issuer     text,                        -- PNA, sociedad de clasificación, etc.
  sort_order integer NOT NULL DEFAULT 0,
  status     entity_status NOT NULL DEFAULT 'activo',
  CONSTRAINT vessel_certificate_types_code_not_blank CHECK (btrim(code) <> '')
);
CREATE UNIQUE INDEX vessel_certificate_types_company_code_key
  ON vessel_certificate_types (company_id, upper(code)) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX vessel_certificate_types_global_code_key
  ON vessel_certificate_types (upper(code)) WHERE company_id IS NULL;

-- ---------------------------------------------------------------------------
-- vessel_certificates  (RMGS-05 "Verificación de documentación")
--
-- Tabla dedicada y no un record_type genérico: el control de vencimientos es
-- funcionalidad transversal (alertas) y su forma es estable en todos los
-- manuales relevados.
-- ---------------------------------------------------------------------------
CREATE TABLE vessel_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE RESTRICT,
  vessel_id           uuid NOT NULL,
  certificate_type_id uuid REFERENCES vessel_certificate_types (id) ON DELETE SET NULL,
  certificate_label   text NOT NULL,      -- denominación tal como figura en el manual
  certificate_number  text,
  issued_at           date,
  expires_at          date,
  next_renewal_at     date,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT vessel_certificates_dates_coherent
    CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);
CREATE INDEX vessel_certificates_vessel_idx ON vessel_certificates (vessel_id);
CREATE INDEX vessel_certificates_expiry_idx ON vessel_certificates (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE TRIGGER vessel_certificates_set_updated_at BEFORE UPDATE ON vessel_certificates
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

-- `status` es derivado de expires_at: se expone como columna generada por
-- función y no se persiste, para que no quede "vigente" un certificado que
-- venció mientras nadie tocaba la fila.
CREATE OR REPLACE FUNCTION certificate_status_at(expires_at date, warn_days integer DEFAULT 30)
RETURNS certificate_status
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN expires_at IS NULL                                    THEN 'vigente'::certificate_status
    WHEN expires_at < current_date                             THEN 'vencido'::certificate_status
    WHEN expires_at <= current_date + warn_days                THEN 'por_vencer'::certificate_status
    ELSE 'vigente'::certificate_status
  END;
$$;
