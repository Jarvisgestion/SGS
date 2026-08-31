# Modelo de datos — Plataforma SGS (multi-empresa)

> Basado en el relevamiento de `01-catalogo-registros-chiarmar.md`. Diseñado para que
> cada compañía (Xeitosiño S.A., Pesantar, y cualquier otro cliente futuro) tenga
> **su propio catálogo de procedimientos y tipos de registro**, editable, sin que el
> esquema de base de datos deba cambiar. Chiarmar se usa solo como caso de prueba /
> semilla para validar que el modelo soporta la variedad real de formularios de un
> MGS bajo Ord. PNA 05/18.
>
> Este documento es agnóstico de stack (no asume Postgres/Mongo/Prisma en
> particular) — se define primero el modelo conceptual y las entidades, y al final
> se da una traducción de referencia a SQL relacional por ser la opción más natural
> dado que casi todo el contenido es formularios estructurados con trazabilidad y
> reportes (auditoría PNA), pero es un punto a confirmar según el stack de backend
> que se elija.

## 1. Principios de diseño

1. **Catálogo configurable por empresa, no hardcodeado.** `companies` →
   `manual_versions` → `procedures` → `record_types` es un árbol propio de cada
   cliente. Nada del dominio ("PE-01", "RMGS-04", etc.) vive en el código de la
   aplicación.
2. **Formularios dinámicos vía esquema declarativo.** Cada `record_type` define sus
   campos en una estructura tipo JSON Schema (`record_types.field_schema`), para
   soportar la enorme variedad de formularios sin crear una tabla por tipo de
   registro (43 tipos solo en Chiarmar, y va a crecer con cada empresa).
3. **Separación estricta entre plantilla e instancia.** `record_types` (la
   definición/plantilla del formulario) vs. `record_instances` (un formulario
   concreto completado a bordo). Esto es lo que permite versionar un procedimiento
   (nueva revisión del MGS) sin romper los registros históricos ya firmados.
4. **Trazabilidad completa como ciudadano de primera clase**, no como un campo
   extra: cada instancia tiene su propia tabla de revisiones (`record_reviews`) y
   firmas (`signatures`), nunca se pisa el estado anterior.
5. **Firma como entidad propia**, desacoplada del método (canvas vs. PIN), porque
   la decisión #3 del proyecto (qué método acepta PNA para qué tipo de registro)
   todavía está pendiente de confirmar — el modelo no debe asumir una respuesta.
6. **Multi-tenant por `company_id`** en todas las tablas operativas, con `vessel_id`
   donde corresponda (una compañía puede tener varios buques, y varios de los
   registros son por buque, no por compañía).

## 2. Entidades principales

### 2.1 `companies` (empresas)

Datos que hoy están en el punto "2.1 Datos de la Compañía" de cada MGS (RMGS-01
implícito): razón social, CUIT, domicilio fiscal/administrativo, contactos, OMI de
la empresa si aplica.

```
companies
  id
  name                    -- "Xeitosiño S.A.", "Pesantar"
  cuit
  fiscal_address
  operational_address
  contact_emails[]
  status                  -- activo / inactivo
  created_at, updated_at
```

### 2.2 `vessels` (buques) — modela RMGS-04

```
vessels
  id
  company_id  -> companies
  name                    -- "Huafeng 827"
  matricula
  omi
  vessel_type             -- "buque motor"
  service                 -- "pesquero"
  specific_operation      -- "arrastrero"
  specs (jsonb)           -- eslora, manga, puntal, tonelaje, motor, potencia...
  status                  -- activo / inactivo / retirado_de_servicio
  created_at, updated_at
```

`specs` va en JSON porque la ficha técnica varía por tipo de buque (un fresquero no
necesariamente tiene los mismos campos que un factoría) y no vale la pena migrar el
esquema cada vez que cambia un dato técnico secundario.

### 2.3 `vessel_certificates` — modela RMGS-05

Tabla dedicada (no genérica) porque el control de vencimientos es una
funcionalidad transversal de alto valor (alertas) y tiene una forma muy estable
en todos los manuales relevados:

```
vessel_certificates
  id
  vessel_id  -> vessels
  certificate_type        -- catálogo editable por compañía, no fijo
  certificate_number
  issued_at
  expires_at
  next_renewal_at
  status                  -- vigente / por_vencer / vencido
  attachment_id -> attachments (nullable)
```

### 2.4 `users` y roles

```
users
  id
  company_id -> companies (nullable si es asesor externo multi-empresa)
  default_vessel_id -> vessels (nullable)
  full_name
  dni
  email
  auth_credentials        -- hash de password, etc.
  pin_hash                -- para confirmación por PIN en checklists
  signature_on_file (blob/url, opcional) -- firma manuscrita "guardada" para reutilizar
  status
  created_at, updated_at

user_roles
  id
  user_id -> users
  role                    -- capitan | jefe_maquinas | oficial | tripulante |
                           -- persona_designada | armador | responsable_sh |
                           -- asesor_externo | admin_plataforma
  vessel_id -> vessels (nullable, para roles embarcados)
  company_id -> companies
  valid_from, valid_to     -- soporta cambios de mando (RMGS-02) sin perder historial
```

Modelar el rol como tabla aparte (no como columna única en `users`) es necesario
porque una misma persona puede ser Capitán del Huafeng 827 en una marea y pasar a
otro buque, y porque el asesor externo (vos) opera sobre varias compañías a la vez.

### 2.5 `manual_versions` — versiones del MGS por compañía

```
manual_versions
  id
  company_id -> companies
  revision_number          -- "Rev. 04"
  effective_date
  status                   -- borrador | vigente | superada
  source_document_id -> attachments (nullable, el PDF original si se digitalizó)
  created_at
```

### 2.6 `procedures` — procedimientos (PE-01, PO-02, ..., PA-06)

```
procedures
  id
  manual_version_id -> manual_versions
  code                     -- "PE-01", "PM-04" (libre, no enum: cada empresa define el suyo)
  name
  sort_order
  status                   -- vigente / derogado
```

### 2.7 `record_types` — catálogo de tipos de registro (la plantilla)

Esta es la tabla central del modelo dinámico:

```
record_types
  id
  procedure_id -> procedures
  code                     -- "RE-01A", "RMGS-04", "RO-05B"...
  name
  category                 -- master_data | scheduled_checklist | incident_event
                           -- | management_review | risk_assessment | inactive_vessel
  recurrence_type          -- none | fixed_interval_days | on_event | daily | monthly
  recurrence_days          -- ej. 30, 60, 365 (nullable)
  scope                    -- company | vessel  (RMGS-06 es de compañía; RE-01A es de buque)
  allowed_creator_roles[]  -- qué roles pueden crear una instancia (ej. NNC)
  allowed_reviewer_roles[] -- qué roles pueden aprobar/observar (PD, asesor externo)
  signature_requirement    -- none | manuscrita | pin | ambas | configurable_por_firmante
  field_schema (jsonb)     -- definición dinámica de campos (ver sección 3)
  version                  -- para poder revisar el formulario sin romper instancias viejas
  status                   -- vigente / derogado
  created_at, updated_at
```

### 2.8 `record_instances` — un formulario concreto completado

```
record_instances
  id
  record_type_id -> record_types
  record_type_version         -- copia inmutable de la versión usada, aunque el tipo cambie después
  company_id -> companies
  vessel_id -> vessels (nullable si scope=company)
  marea / singladura (nullable)
  occurred_at                 -- fecha/hora del hecho o del checklist (puede diferir de created_at)
  data (jsonb)                -- valores de los campos, según field_schema
  status                      -- borrador | pendiente_revision | aprobado | observado
  parent_record_instance_id -> record_instances (nullable) -- ej. RE-01B que generó un RO-07A
  created_by -> users
  created_at
  submitted_at
  synced_at                   -- cuándo se sincronizó desde el buque (si se guardó localmente offline)
  updated_at
```

`data` guarda los valores de un formulario dinámico. Los campos "duros" que se
repiten en *todos* los registros (buque, fecha, marea) se sacan a columnas propias
para poder indexarlos/filtrarlos rápido; el resto queda en `data` porque varía
demasiado entre los ~43+ tipos relevados.

### 2.9 `record_reviews` — historial de revisión (tierra)

No se pisa el estado en `record_instances`; cada decisión de la Persona Designada o
el asesor queda registrada:

```
record_reviews
  id
  record_instance_id -> record_instances
  reviewer_id -> users
  decision                -- aprobado | observado
  comment
  reviewed_at
```

`record_instances.status` es una vista derivada de la última fila de
`record_reviews` (o se actualiza por trigger/aplicación al insertar una revisión),
pero la tabla de reviews es la fuente de verdad histórica que exige la trazabilidad
ante una inspección de PNA.

### 2.10 `signatures`

```
signatures
  id
  record_instance_id -> record_instances (nullable)
  record_review_id -> record_reviews (nullable)
  signer_user_id -> users
  signer_role              -- el rol con el que firmó ese acto puntual
                           -- (ej. "mando_saliente" / "mando_entrante" en RMGS-02,
                           --  "entrega" / "recibe" en RMGS-03)
  method                    -- canvas | pin
  signature_image (blob/url, nullable) -- solo si method=canvas
  signed_at
  device_metadata (jsonb, opcional) -- útil como evidencia adicional, no como reemplazo legal
```

Una misma `record_instances` puede tener **N firmas** (ej. RM-04A tiene
Pedido/Recibido/Conforme), por eso `signatures` es una tabla aparte y no una
columna en `record_instances`.

### 2.11 `attachments`

```
attachments
  id
  record_instance_id -> record_instances (nullable)
  vessel_certificate_id -> vessel_certificates (nullable)
  file_url
  file_type                -- pdf | image | email
  uploaded_by -> users
  uploaded_at
```

Cubre casos como "se adjuntará la comunicación realizada, pudiendo ser copia de
mail" (PE-01) o el certificado escaneado de `vessel_certificates`.

### 2.12 `risk_assessments` — matriz de riesgo (PO-08)

Se modela aparte porque **otros registros la referencian** (RO-07A cita "Cuadro
N°X"), no porque sea un tipo de registro más:

```
risk_assessments
  id
  company_id -> companies
  vessel_id -> vessels (nullable, puede ser genérico de compañía)
  work_position             -- "Capitán", "Cocinero", etc.
  hazard_source
  probability                -- enum o 1-3
  consequence                -- enum o 1-3
  risk_score (probability * consequence, o derivado)
  control_measures
  responsible -> users (nullable)
  residual_risk
  status                     -- vigente / revisado
  version
```

`record_instances.data` de tipos como RO-07A o RE-01 puede llevar una referencia
`risk_assessment_id` dentro del JSON (o como columna dedicada si el `record_type`
lo requiere) para trazar qué evaluación de riesgo aplicó.

### 2.13 `audit_log`

```
audit_log
  id
  entity_type               -- "record_instance", "record_review", "vessel_certificate", ...
  entity_id
  action                     -- created | updated | status_changed | signed | synced
  actor_user_id -> users
  occurred_at
  metadata (jsonb)           -- diff o detalle de qué cambió
```

Genérico y append-only, para dar la trazabilidad "quién cargó, cuándo, quién
corroboró, cuándo" exigida por el flujo de trabajo, incluso para acciones que no
encajan prolijamente en `record_reviews` (ediciones de borrador, reintentos de
sincronización, etc.).

## 3. `field_schema`: cómo se definen los campos de un formulario dinámico

Cada `record_types.field_schema` es un array de definiciones de campo. Tipos de
campo identificados a partir del relevamiento (sección "Patrones detectados" del
catálogo):

| Tipo de campo | Ejemplo de uso real |
|---|---|
| `text` / `textarea` | Descripción del acontecimiento (RE-01B/C/D/E) |
| `date` / `time` | Fecha/hora de todos los registros |
| `select` | "Puesto: Capitán / Jefe de máquinas / PD" (RMGS-02) |
| `boolean` (Sí/No) | "Se informa a Compañía", "Necesita remolque" (RE-01) |
| `checklist` | Ítems de RO-05A-G, con estado ok/no-ok/n-a por ítem |
| `table` (filas repetibles) | RM-04B (pedido de materiales), RO-03D (personal tercerizado), RMGS-03 (documentos entregados) |
| `signature_block` | Referencia a que ese punto del formulario requiere una firma (vinculada a `signatures`) |
| `file` | Adjuntar copia de mail/foto (PE-01, punto "Procedimiento buque-tierra") |
| `risk_reference` | Selección de un `risk_assessments.id` existente (RO-07A) |

Ejemplo simplificado de `field_schema` para **RE-01D (Incendio)**:

```json
[
  { "key": "descripcion", "type": "textarea", "label": "Descripción del siniestro", "required": true },
  { "key": "lugar_inicio", "type": "text", "label": "Lugar de inicio del incendio" },
  { "key": "condiciones_meteo", "type": "text", "label": "Condiciones hidrometeorológicas" },
  { "key": "medidas_preventivas", "type": "checklist", "label": "Medidas preventivas tomadas",
    "options": ["Corte suministro eléctrico", "Cierre de ventilación", "Puertas corta fuego", "Puertas estancas"] },
  { "key": "elementos_usados", "type": "checklist", "label": "Elementos de lucha contra incendio",
    "options": ["E.R.A", "Mangueras de incendio", "Extintores", "Equipo de CO2", "Traje de bombero"] },
  { "key": "informa_compania", "type": "boolean", "label": "Se informa a Compañía" },
  { "key": "informa_pna", "type": "boolean", "label": "Se informa a PNA" },
  { "key": "hubo_heridos", "type": "boolean", "label": "Hubo heridos", "triggers_record_type": "RO-07A" },
  { "key": "necesita_remolque", "type": "boolean", "label": "Necesita remolque", "triggers_record_type": "RE-01R" },
  { "key": "firma_capitan", "type": "signature_block", "signer_role": "capitan" }
]
```

Ejemplo de **RM-04B (Pedido de Materiales)**, con campo tipo tabla:

```json
[
  { "key": "marea", "type": "text", "label": "Marea N°" },
  { "key": "sector", "type": "select", "label": "Sector", "options": ["Puente", "Cubierta", "Máquina", "Técnica/Armamento"] },
  { "key": "items", "type": "table", "label": "Ítems solicitados",
    "columns": [
      { "key": "cantidad_pedida", "type": "number" },
      { "key": "urgencia", "type": "select", "options": ["Normal", "Urgente"] },
      { "key": "descripcion", "type": "text" },
      { "key": "cantidad_recibida", "type": "number" }
    ] },
  { "key": "firma_pedido", "type": "signature_block", "signer_role": "solicitante" },
  { "key": "firma_recibido", "type": "signature_block", "signer_role": "tierra" },
  { "key": "firma_conforme", "type": "signature_block", "signer_role": "solicitante" }
]
```

`triggers_record_type` en el primer ejemplo es la forma declarativa de resolver el
patrón "un registro dispara la creación de otro" (RE-01 → RO-07A / RE-01R) sin
hardcodear esa regla en el código de la aplicación: la UI, al ver `true` en un
campo marcado con `triggers_record_type`, ofrece crear una instancia del tipo
indicado y la enlaza vía `parent_record_instance_id`.

## 4. Flujo de estados de `record_instances`

```
borrador ──(guardado local / autoguardado)──> borrador
   │
   └─(el buque envía / sincroniza)──> pendiente_revision
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                              ▼
                          aprobado                       observado
                    (queda cerrado,                 (vuelve a borrador
                     solo lectura,                   editable a bordo,
                     con sello visual)                con el comentario
                                                       de la revisión visible)
```

`borrador` es lo que cubre el requisito de "guardar localmente mientras se
completa, por si se corta la señal a mitad de carga" (decisión #1 del proyecto):
es simplemente una `record_instances` con `status = borrador` que puede vivir
primero en almacenamiento local del dispositivo y sincronizarse cuando hay señal,
sin necesidad de un modo offline complejo.

## 5. Qué NO se modela como tabla propia (y por qué)

- **RA-06 C (Monitoreo y Control del SGS):** es un meta-registro que verifica el
  estado de otros registros. Se resuelve como una **vista/reporte** calculado sobre
  `record_instances` + `record_types.recurrence_*` (¿qué registros con recurrencia
  fija no tienen instancia `aprobado` reciente?), no como una tabla de datos nueva.
- **PO-08 Anexo (matriz maestra) vs. RO-08 (instancia puntual):** ambas usan
  `risk_assessments`; la diferencia es si `vessel_id`/`work_position` son genéricos
  (maestro) o específicos de un hecho puntual (instancia), y si tiene o no un
  `record_instance_id` de origen (RO-07A, RE-01, etc.) que la disparó.
- **"Historial del procedimiento"** (tabla Fecha/Revisión/Descripción/Responsable
  que aparece al pie de cada procedimiento en el PDF): es el changelog del
  `procedures`/`record_types` mismo. Se resuelve versionando esas tablas
  (`record_types.version`, y una tabla `procedure_revisions` opcional si se quiere
  guardar el texto de cada cambio), no como un registro operativo más.

## 6. Estado y próximos pasos

**El alcance se replanteó:** esta etapa valida el circuito completo con un solo
procedimiento, PE-01, antes de abrir el resto del manual. Ver `docs/05-piloto-pe-01.md`.

1. **Esquema SQL y migraciones** — *hecho*. Ver `db/` y `docs/03-esquema-sql.md`.
2. **Prototipo de aplicación** — *hecho*. Ver `app/` y `docs/04-prototipo.md`.
3. **Piloto de PE-01 con respaldo en papel e impresión** — *hecho, falta probarlo
   en uso real*. Los 7 registros de PE-01 con sus campos, el PDF del formulario
   firmado obligatorio en RE-01A, y la impresión con formato de formulario para los
   demás. Ver `docs/05-piloto-pe-01.md`.
4. **Evaluar el piloto en uso real** — *pendiente, es el paso que sigue*. Con esa
   experiencia se decide si conviene avanzar con la administración del catálogo o
   con el resto de los procedimientos.

**En pausa hasta evaluar el piloto** (desarrollado o decidido, pero fuera de
prioridad; nada se descarta):

- Los otros 9 procedimientos del manual. El catálogo completo sigue cargado.
- La administración del catálogo desde la aplicación.
- La pantalla de empresa activa para asesores multi-empresa.
- La decisión del catálogo semilla para Xeitosiño y Pesantar.
- `signature_requirement` según criterio de PNA: mientras la firma digital no esté
  habilitada, el respaldo válido es el papel firmado y la pregunta no aplica.
- Relevar el manual de Xeitosiño / Pesantar y validar el modelo contra un segundo
  caso real.

## 7. Diferencias entre este documento y el esquema implementado

El esquema de `db/` se apartó de este documento en cuatro puntos, todos por razones
que aparecieron al escribir el SQL. Están detallados en `docs/03-esquema-sql.md`:

1. `field_schema`, recurrencia, firmas y roles habilitados se movieron de
   `record_types` a una tabla `record_type_versions`. Sin eso, editar un formulario
   reescribía el histórico ya firmado, que es justamente lo que el principio de
   diseño #3 promete evitar.
2. `vessel_certificates.status` y `record_instances.status` derivado: el estado de
   vencimiento de un certificado no se almacena, se calcula en una vista. Un estado
   guardado queda obsoleto solo con que pase el tiempo.
3. `record_types.scope` admite un tercer valor, `vessel_optional`: hay registros
   (no conformidad, capacitación, análisis de riesgo) que pueden ser de la empresa
   o de un buque, y el par company/vessel no los cubría.
4. Se agregó `record_instances.client_uuid` para que reenviar un registro tras un
   corte de señal no lo duplique.
