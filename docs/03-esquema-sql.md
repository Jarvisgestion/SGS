# Esquema SQL — decisiones al bajar el modelo a PostgreSQL

> Continúa `02-modelo-de-datos.md` (punto 4 de "Próximos pasos": elegir motor de
> persistencia y traducir el modelo a migraciones reales). El esquema
> ejecutable está en `db/migrations/`, se aplica con `scripts/db-apply.sh` y
> tiene aserciones automáticas en `db/test/` (`scripts/db-test.sh`).
>
> Este documento no repite el modelo conceptual: registra **qué se decidió, qué
> quedó garantizado por la base y qué queda pendiente de confirmar con el
> cliente o con PNA**.

## 1. Motor: PostgreSQL 16

Se confirma la opción que el modelo ya insinuaba. Los tres requisitos que
inclinaron la decisión:

1. **Formularios dinámicos + relaciones duras a la vez.** El catálogo
   (`record_types.field_schema`) y los datos cargados (`record_instances.data`)
   son JSON; pero empresa, buque, roles, firmas, revisiones y vencimientos son
   relaciones con integridad referencial. `jsonb` con índices GIN da lo primero
   sin renunciar a lo segundo.
2. **Trazabilidad exigible ante PNA.** Constraints, triggers y tablas
   append-only permiten que la traza no dependa de que el backend "se acuerde"
   de escribirla. Ver §3.
3. **Reportes de cumplimiento** (RA-06C) como vistas SQL, sin ETL ni proceso
   aparte. Ver §5.

Requiere las extensiones `pgcrypto` (uuid), `btree_gin` y `citext` — todas de
`contrib`, disponibles en cualquier Postgres administrado.

## 2. Lo que el modelo conceptual no decía y hubo que resolver

| Tema | Decisión | Dónde |
|---|---|---|
| Versión del formulario | `record_type_versions` congela `field_schema` + requisitos de firma en cada versión; `record_instances` guarda `(record_type_id, record_type_version)` con FK a ese snapshot. Revisar un formulario ya no puede alterar cómo se lee un registro firmado. | `0004_catalog.sql` |
| Subir la versión | Un trigger la incrementa **solo** si cambió `field_schema`, `name`, `signature_requirement` o `allowed_creator_roles`. Un cambio de `status` o `sort_order` no genera versión nueva. | `sgs_snapshot_record_type` |
| Roles | Tabla `roles` (catálogo, no `enum`): la plataforma trae los base y cada empresa agrega los suyos. Los "roles de acto de firma" (entrega/recibe, saliente/entrante, pedido/conforme) viven en la misma tabla porque `signatures.signer_role` los necesita. | `0003_users_roles.sql` |
| Cambio de mando (RMGS-02) | `roles.exclusive_per_vessel`: no puede haber dos Capitanes vigentes sobre el mismo buque. El relevo obliga a cerrar el rol saliente (`valid_to`) antes de abrir el entrante, que es exactamente el acto que RMGS-02 documenta. | `sgs_check_user_role` |
| Estado del certificado | `vessel_certificates.status` **no se persiste**: se calcula con `certificate_status_at(expires_at)`. Un certificado no puede quedar "vigente" en la base porque nadie tocó la fila el día que venció. | `0002_companies_vessels.sql` |
| Escala de riesgo | Se fijó 1–3 × 1–3 con `risk_score` como columna generada y `risk_level()` (bajo ≤2, medio ≤4, alto >4). **A confirmar** contra la escala real que use el anexo de PO-08 de cada empresa. | `0006_risk_audit.sql` |
| Adjuntos | Migración 0010: el archivo va al disco y en `attachments` queda `storage_key` (el sha256 de su contenido). `file_url` pasa a ser opcional, para los adjuntos que son un enlace externo. La base deja de engordar con binarios que nunca se consultan por contenido. | `api/src/storage.ts` |
| Revisión superada | El catálogo que ve el buque sólo lista los formularios de la revisión **vigente** del manual: poner la Rev. 05 en vigencia deja de ofrecer los de la Rev. 04, que es lo que significa superarla. La lectura de un registro viejo no se restringe — sigue mostrándose con su formulario congelado. | `api/src/routes/catalog.ts` |
| Desvíos de checklist | No hay tabla de desvíos: la vista `v_record_nonconformities` extrae los ítems en `no_ok` de cualquier checklist. El "Anexo de desvíos" de PO-05 sale de ahí, y si además se quiere un registro firmado aparte, se crea como `record_type` hijo con `parent_record_instance_id`. | `0007_views.sql` |

## 3. Qué garantiza la base (y no queda librado al backend)

Estas reglas están como constraints o triggers, y todas tienen su aserción en
`db/test/010_schema_assertions.sql`:

- **Aislamiento entre empresas.** Ninguna fila operativa puede referenciar un
  buque, un catálogo o un registro de otra compañía: las FK son compuestas
  `(id, company_id)` contra claves alternativas. No depende de que el backend
  agregue `WHERE company_id = ...`.
- **Alcance del registro.** `scope = vessel` exige `vessel_id`; `scope = company`
  lo prohíbe.
- **Quién mantiene la matriz de riesgo.** `roles.can_manage_risk` (migración
  0011) y un trigger sobre `risk_assessments`. Es un permiso aparte del
  catálogo: la matriz es del Responsable de Seguridad e Higiene, que no
  necesariamente administra el manual.
- **Quién puede editar el catálogo.** `roles.can_manage_catalog` (migración
  0009) y triggers sobre `manual_versions`, `procedures`, `record_types` y
  `vessels`. Cuando no hay actor declarado —migraciones, seeds, scripts— no se
  verifica nada: no hay a quién pedirle permiso.
- **Quién puede emitir y quién revisar.** `allowed_creator_roles` y
  `allowed_reviewer_roles` se verifican contra los roles vigentes del usuario en
  ese buque y a esa fecha — es lo que hace cumplible la restricción de emisores
  de la NNC, y lo que impide que el Capitán apruebe su propio registro.
- **Validación del formulario.** `data` se valida contra el `field_schema` de la
  versión congelada al salir de borrador: campos obligatorios, tipos, opciones
  de `select`/`checklist`, columnas declaradas de las tablas, y campos no
  declarados. En `borrador` no se valida nada (ver §4).
- **Un registro aprobado es de sólo lectura**, y no admite nuevas revisiones.
- **Observar exige comentario.**
- **Append-only:** `signatures`, `record_reviews` y `audit_log` rechazan UPDATE y
  DELETE a nivel de base. Una firma equivocada se corrige firmando de nuevo, no
  borrando.
- **Bitácora automática.** Altas, cambios de estado, firmas y revisiones se
  escriben en `audit_log` por trigger, incluso si la escritura vino de un
  script o de la consola. El backend aporta el actor con
  `SET LOCAL sgs.actor_user_id`.

## 4. El borrador es el modo offline

`record_instances` con `status = borrador` no valida `data`. Eso es deliberado:
resuelve el requisito de "guardar mientras se completa, por si se corta la señal"
sin un modo offline aparte. El dispositivo guarda local, sincroniza cuando hay
señal (`synced_at`), y recién al enviar (`pendiente_revision`) el formulario
tiene que estar completo y bien tipado.

## 5. Vistas de control

| Vista | Para qué |
|---|---|
| `v_record_compliance` | RA-06C, medido contra la **revisión vigente** del manual: por cada tipo de registro recurrente y buque, última instancia aprobada, próximo vencimiento y estado (`al_dia` / `por_vencer` / `vencido` / `sin_registro` / `no_aplica`). Es el tablero de la Persona Designada. |
| `v_vessel_certificate_status` | RMGS-05: vencimientos de certificados con días restantes. |
| `v_pending_reviews` | Bandeja de revisión, con cuánto hace que espera cada registro. |
| `v_record_instance_signatures` | Qué bloques de firma declara el formulario y cuáles están efectivamente firmados. |
| `v_record_nonconformities` | Ítems `no_ok` de cualquier checklist. |
| `v_registros_hijos_pendientes` | Hechos ya enviados que, por lo marcado en el formulario (`triggers_record_type`), exigen otro registro que todavía no se cargó. Un borrador no cuenta: la obligación nace al enviarlo. |

## 6. Pendientes que este esquema deja explícitos

1. **`signature_requirement` por tipo de registro** — el esquema lo soporta
   (`none | manuscrita | pin | ambas | configurable_por_firmante`) pero el
   criterio de qué evidencia acepta PNA para qué registro sigue sin confirmar.
   El seed de demo usa valores plausibles, no una definición del cliente.
2. **Escala de la matriz de riesgo** — hoy 1–3 × 1–3 (§2). Si el anexo de PO-08
   de Xeitosiño o Pesantar usa otra escala, es una migración de una línea sobre
   el CHECK, pero conviene confirmarlo antes de cargar datos.
3. **Quién puede firmar un bloque declarado para otro rol.** Hoy cualquiera con
   sesión puede firmar cualquier bloque del formulario: la firma queda a su
   nombre, pero nada impide que el Capitán firme el bloque de la Persona
   Designada. No se resolvió porque varios `signer_role` no son puestos sino
   roles del acto de firmar (entrega, recibe, conforme), que nadie "tiene" como
   rol asignado — hace falta una definición antes de poner una regla.
4. **Catálogo real de Xeitosiño y Pesantar** — sigue siendo el punto 1 y 2 de
   los próximos pasos de `02-modelo-de-datos.md`, y el que valida de verdad que
   el modelo no quedó calcado de Chiarmar. Lo que sí está resuelto ahora es que
   cargar un catálogo distinto es `INSERT`, no migración.
5. **Autenticación y RLS** — `users.password_hash` / `pin_hash` son
   marcadores de posición: falta decidir el proveedor de identidad. Y si la API
   va a conectarse con un rol de base por empresa, corresponde agregar Row
   Level Security sobre `company_id`; el esquema ya tiene la columna en todas
   las tablas operativas para poder hacerlo sin rediseño.
6. **API y cliente.** La capa HTTP está en `api/` y la aplicación en
   `client/`: el ciclo del registro y el ABM del catálogo están implementados y
   probados contra la base real. Falta la subida de archivos y poder duplicar
   una revisión del manual al crear la siguiente.
7. **Retención y borrado** — hay FKs `ON DELETE RESTRICT` en lo que no debería
   poder borrarse (una empresa con registros, un tipo de registro con
   instancias). Falta la política formal de cuánto se conserva un registro
   aprobado.
