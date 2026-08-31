-- 0001_companies_vessels.sql
-- Empresas, buques y certificados (RMGS-04 y RMGS-05 del relevamiento).

CREATE TABLE companies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL,
  legal_name           text,
  cuit                 text,
  fiscal_address       text,
  operational_address  text,
  contact_emails       text[] NOT NULL DEFAULT '{}',
  phone                text,
  status               text NOT NULL DEFAULT 'activo'
                         CHECK (status IN ('activo','inactivo')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX companies_cuit_key ON companies (cuit) WHERE cuit IS NOT NULL;
CREATE TRIGGER companies_set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON TABLE companies IS
  'Empresas armadoras. Cada una tiene su propio manual, catálogo y registros.';


CREATE TABLE vessels (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  matricula           text NOT NULL,
  omi                 text,
  vessel_type         text,              -- "buque motor"
  service             text,              -- "pesquero"
  specific_operation  text,              -- "arrastrero", "poteroa", ...
  specs               jsonb NOT NULL DEFAULT '{}'::jsonb,
  status              text NOT NULL DEFAULT 'activo'
                        CHECK (status IN ('activo','inactivo','retirado_de_servicio')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessels_id_company_key UNIQUE (id, company_id),
  CONSTRAINT vessels_specs_is_object CHECK (jsonb_typeof(specs) = 'object')
);

CREATE UNIQUE INDEX vessels_company_matricula_key ON vessels (company_id, matricula);
CREATE INDEX vessels_company_status_idx ON vessels (company_id, status);
CREATE TRIGGER vessels_set_updated_at BEFORE UPDATE ON vessels
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON TABLE vessels IS 'Flota por empresa. Modela RMGS-04.';
COMMENT ON COLUMN vessels.specs IS
  'Ficha técnica libre (eslora, manga, puntal, TRN, motor, potencia...). Va en JSON '
  'porque varía por tipo de buque y no justifica migrar el esquema.';


-- Catálogo de tipos de certificado. company_id NULL = tipo estándar de plataforma;
-- una empresa puede agregar los suyos sin tocar el esquema.
CREATE TABLE certificate_types (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               uuid REFERENCES companies(id) ON DELETE CASCADE,
  code                     text NOT NULL,
  name                     text NOT NULL,
  issuing_authority        text,
  default_validity_months  integer CHECK (default_validity_months > 0),
  applies_to               text NOT NULL DEFAULT 'buque'
                             CHECK (applies_to IN ('buque','compania','tripulante')),
  status                   text NOT NULL DEFAULT 'activo'
                             CHECK (status IN ('activo','inactivo')),
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX certificate_types_global_code_key
  ON certificate_types (code) WHERE company_id IS NULL;
CREATE UNIQUE INDEX certificate_types_company_code_key
  ON certificate_types (company_id, code) WHERE company_id IS NOT NULL;


CREATE TABLE vessel_certificates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  vessel_id            uuid NOT NULL,
  certificate_type_id  uuid NOT NULL REFERENCES certificate_types(id) ON DELETE RESTRICT,
  certificate_number   text,
  issued_at            date,
  expires_at           date,
  next_renewal_at      date,
  alert_days_before    integer NOT NULL DEFAULT 30 CHECK (alert_days_before >= 0),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_certificates_vessel_fk
    FOREIGN KEY (vessel_id, company_id) REFERENCES vessels (id, company_id) ON DELETE CASCADE,
  CONSTRAINT vessel_certificates_dates_chk
    CHECK (expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at)
);

CREATE INDEX vessel_certificates_vessel_idx ON vessel_certificates (vessel_id);
CREATE INDEX vessel_certificates_expiry_idx ON vessel_certificates (expires_at)
  WHERE expires_at IS NOT NULL;
CREATE TRIGGER vessel_certificates_set_updated_at BEFORE UPDATE ON vessel_certificates
  FOR EACH ROW EXECUTE FUNCTION sgs_set_updated_at();

COMMENT ON TABLE vessel_certificates IS
  'Certificados por buque (RMGS-05). El estado vigente/por_vencer/vencido NO se '
  'almacena: se deriva en la vista v_vessel_certificate_status para que no quede obsoleto.';
