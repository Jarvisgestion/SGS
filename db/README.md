# Esquema de base de datos — Plataforma SGS

Traducción a PostgreSQL del modelo de `docs/02-modelo-de-datos.md`. SQL plano, sin
ORM: sirve igual para un backend Node/TypeScript o Python, que es una decisión
todavía abierta.

Requiere **PostgreSQL 15 o superior** (las vistas usan `security_invoker`).

## Puesta en marcha

```bash
export DATABASE_URL="postgres://usuario@localhost/sgs_dev"

db/scripts/migrate.sh   # aplica migraciones pendientes (idempotente)
db/scripts/reset.sh     # DESTRUCTIVO: recrea el esquema desde cero
db/scripts/test.sh      # reset + semilla + pruebas de reglas
```

Cada migración corre en su propia transacción y se anota en `schema_migrations`.
Las migraciones ya aplicadas no se editan: se agrega una nueva.

## Estructura

```
db/
  migrations/   0000..0007, en orden. Fuente de verdad del esquema.
  seed/         01 catálogo de referencia, 02 datos operativos de demo.
  tests/        Pruebas de que el motor hace cumplir las reglas del SGS.
  scripts/      migrate / reset / test.
```

| Migración | Contenido |
|---|---|
| `0000_bootstrap` | `schema_migrations`, helpers (`updated_at`, usuario y empresa de sesión) |
| `0001_companies_vessels` | `companies`, `vessels`, `certificate_types`, `vessel_certificates` |
| `0002_users_roles` | `users`, `roles`, `user_roles` con vigencia |
| `0003_catalog` | `manual_versions` → `procedures` → `record_types` → `record_type_versions` + validación de `field_schema` |
| `0004_record_instances` | `record_instances`, `record_reviews`, `signatures` y la máquina de estados |
| `0005_risk_attachments_audit` | `attachments`, `risk_assessments`, `audit_log` |
| `0006_views` | Vistas de cumplimiento, vencimientos, bandeja de revisión y trazabilidad |
| `0007_rls` | Aislamiento multi-empresa por Row Level Security + rol `sgs_app` |
| `0008_auth_functions` | Funciones de login (`SECURITY DEFINER`): el único paso que atraviesa RLS, porque autenticar es previo a saber la empresa |

## Cómo se conecta la aplicación

La app **no** debe conectarse como dueño de las tablas (el dueño saltea RLS). Se
conecta con un rol miembro de `sgs_app`, que crea `db/scripts/create-app-role.sh`:

```bash
DATABASE_URL="<url del dueño>" db/scripts/create-app-role.sh   # crea sgs_web
```

Al inicio de cada request fija el contexto:

```sql
SET LOCAL sgs.current_company_id = '<uuid de la empresa>';
SET LOCAL sgs.current_user_id    = '<uuid del usuario>';
```

Sin `sgs.current_company_id`, las políticas no devuelven ninguna fila: un olvido
del backend no puede convertirse en una fuga de datos entre empresas.
`sgs.current_user_id` es lo que queda asentado como autor en `audit_log`.

## Reglas que hace cumplir el motor (no la aplicación)

Verificadas por `db/tests/01_reglas.sql`:

- **Catálogo:** `field_schema` válido (tipos conocidos, sin claves repetidas,
  `select`/`checklist` con opciones, `signature_block` con rol, sin tablas
  anidadas), y los roles referenciados deben existir.
- **Versionado:** el `field_schema` de una versión que ya tiene registros cargados
  no se puede editar; hay que crear una versión nueva. El histórico firmado no se
  reescribe nunca.
- **Alcance:** un registro de buque exige `vessel_id`; uno de empresa lo prohíbe.
- **Permisos:** solo los roles declarados en `allowed_creator_roles` crean, y los
  de `allowed_reviewer_roles` revisan.
- **Estados:** `borrador → pendiente_revision → aprobado | observado`. No se puede
  saltear la revisión, y un registro aprobado es de solo lectura.
- **Revisiones y firmas:** append-only. Observar exige comentario escrito.
- **Firmas:** canvas exige imagen; PIN exige usuario; siempre hay firmante
  identificado (con o sin usuario en la plataforma, para personal tercerizado).
- **Sincronización:** `client_uuid` hace idempotente el reenvío tras un corte de
  señal.
- **Roles:** no se solapan dos asignaciones del mismo rol y buque para una persona.
- **Multi-empresa:** una empresa no ve datos ni catálogo de otra.

## Semilla

`01_catalogo_referencia.sql` carga los **44 tipos de registro** relevados en
`docs/01`, agrupados en 10 procedimientos, bajo una empresa llamada
*"Empresa Demo (catálogo de referencia)"*.

Se carga deliberadamente bajo una empresa demo y **no** bajo Xeitosiño ni Pesantar:
si arrancan de cero o clonan este catálogo es una decisión pendiente.

De los 44 tipos, **14 tienen `field_schema` completo** — los que quedaron
efectivamente relevados. Los otros 30 tienen la estructura (código, categoría,
alcance, recurrencia, firmas, roles habilitados) pero `field_schema = '[]'`: sus
campos salen del formulario real de cada empresa. Se distinguen con:

```sql
SELECT procedure_code, record_code, record_name
FROM v_record_type_current WHERE field_count = 0 ORDER BY 1, 2;
```
