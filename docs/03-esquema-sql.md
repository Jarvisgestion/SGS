# Esquema SQL — decisiones, desvíos y puntos abiertos

Acompaña al código de `db/`. `docs/02-modelo-de-datos.md` define el modelo
conceptual; este documento explica **qué cambió al implementarlo y por qué**, y qué
quedó sin resolver.

Motor elegido: **PostgreSQL 15+**. SQL plano, sin ORM, para no atar el esquema a un
stack de backend que todavía no está decidido. Todo lo que sigue está verificado
contra una base real: `db/scripts/test.sh` recrea el esquema, carga la semilla y
corre 37 comprobaciones.

## 1. Desvíos respecto de `docs/02`

### 1.1 El versionado de formularios se movió a su propia tabla

`docs/02` ponía `field_schema`, `recurrence_*`, `signature_requirement`,
`allowed_*_roles` y `version` como columnas de `record_types`, con
`record_instances.record_type_version` como "copia inmutable de la versión usada".

Eso no alcanza: si el formulario se edita en el lugar, el `field_schema` viejo
desaparece y un registro firmado hace dos años ya no se puede volver a renderizar
como se firmó. Ante una inspección de PNA eso es exactamente lo que no puede pasar.

Implementado: `record_types` guarda la identidad estable (código, nombre, categoría,
alcance) y `record_type_versions` guarda **una fila por revisión del formulario**.
`record_instances` apunta a la versión concreta con la que se completó. Un trigger
impide editar el `field_schema` de una versión que ya tiene registros: hay que crear
una versión nueva.

Beneficio lateral: `record_type_versions` **es** el "Historial del procedimiento"
(Fecha / Revisión / Descripción / Responsable) que el MGS imprime al pie de cada
procedimiento — columnas `version`, `change_description`, `changed_by`,
`effective_from`.

### 1.2 Los estados derivables no se almacenan

`docs/02` daba a `vessel_certificates` una columna `status` (vigente / por_vencer /
vencido). Un estado guardado se desactualiza solo con que pase el tiempo, y obliga a
un proceso que lo recalcule. Se calcula en la vista `v_vessel_certificate_status`,
usando `alert_days_before` configurable por certificado.

Lo mismo con RA-06C: se resuelve en `v_record_compliance`, como ya anticipaba
`docs/02` sección 5.

`record_instances.status` **sí** se almacena, pero lo escribe un trigger a partir de
`record_reviews`, que es la fuente de verdad. La aplicación no lo toca.

### 1.3 `scope` tiene un tercer valor

`company | vessel` no cubría los registros que pueden ser de cualquiera de los dos:
la Nota de No Conformidad puede nacer de una auditoría de tierra o de un hallazgo a
bordo; lo mismo capacitación (RO-03B), accidentes a terceros (RO-07C), análisis de
riesgo (RO-08) y entrega de EPP (RO-09). Se agregó `vessel_optional`.

### 1.4 Sincronización idempotente

Se agregó `record_instances.client_uuid`, único por empresa. El dispositivo lo genera
al crear el borrador local; si la señal se corta a mitad del envío y el buque
reintenta, el registro no se duplica. Es lo que hace practicable el requisito de
"guardar localmente mientras se completa" sin un modo offline complejo.

## 2. Decisiones de implementación que `docs/02` no cubría

- **Roles como catálogo, no como enum.** `roles` trae 16 roles estándar
  (`company_id IS NULL`) y cada empresa puede sumar los suyos. `user_roles` tiene
  vigencia (`valid_from` / `valid_to`) con una restricción de exclusión que impide
  solapar dos asignaciones del mismo rol y buque: así el relevo de mando (RMGS-02)
  queda registrado sin perder el histórico.
- **Aislamiento multi-empresa en el motor.** Row Level Security sobre todas las
  tablas operativas, más un rol `sgs_app` sin propiedad de las tablas. Un olvido del
  backend al filtrar por `company_id` no puede convertirse en fuga entre empresas.
  Las vistas usan `security_invoker`; sin eso corrían con permisos del dueño y
  salteaban RLS por completo — se detectó al escribir las pruebas.
- **Consistencia de `company_id` por claves foráneas compuestas.** No se confía en
  que la aplicación mantenga coherente el `company_id` denormalizado: por ejemplo,
  `record_instances (vessel_id, company_id)` referencia `vessels (id, company_id)`,
  así que es imposible asociar un registro a un buque de otra empresa.
- **Validación del `field_schema` al guardarlo.** Un catálogo mal cargado falla al
  definirlo, no meses después cuando un capitán intenta completar el formulario en
  medio de una marea.
- **`audit_log` genérico y append-only**, alimentado por triggers sobre registros,
  revisiones, firmas, certificados, versiones del catálogo y matriz de riesgo.

## 3. Puntos abiertos

1. **RE-01A: una recurrencia por tipo de registro.** El manual fija periodicidades
   distintas por tipo de ejercicio (incendio y abandono cada 30 días; colisión,
   varadura, hombre al agua, sin gobierno y espacios confinados cada 60; buque-tierra
   cada 365). El modelo soporta **una** recurrencia por tipo de registro, y la semilla
   toma la más exigente (30 días), lo que reporta vencimientos antes de tiempo para
   los ejercicios de 60 y 365 días.
   Alternativas: (a) un tipo de registro por ejercicio, (b) una tabla
   `recurrence_rules` que module la recurrencia según el valor de un campo del
   formulario. La (b) es más fiel al manual; conviene decidirlo con un segundo manual
   real a la vista (paso 5).
2. **30 de los 44 tipos de registro tienen `field_schema` vacío.** Tienen estructura
   (código, categoría, alcance, recurrencia, firmas, roles) pero les faltan los
   campos, porque el relevamiento no llegó al detalle de cada formulario. No es un
   problema del esquema: es contenido que sale del formulario real de cada empresa.
3. **La validación de `data` es de forma, no de tipo.** Hoy se verifica que estén los
   campos obligatorios y que no haya campos ajenos al schema. No se valida todavía
   que un `number` traiga un número, que un `select` traiga una de sus opciones, ni
   que una `table` respete sus columnas. Conviene resolverlo en el backend y/o con
   validación JSON Schema real antes del prototipo.
4. **`signature_requirement` se guarda pero no se hace cumplir.** El esquema declara
   por tipo de registro si la firma es manuscrita, por PIN, ambas o configurable,
   pero nada impide todavía aprobar un registro al que le falta una firma exigida.
   Está deliberadamente sin implementar: el criterio depende de qué evidencia
   electrónica acepta PNA (paso 4 de `docs/02`). Cuando esté definido, es un trigger.
5. **Los registros maestros duplican tablas reales.** RMGS-04 (flota), RMGS-05
   (certificados) y RMGS-06 (organigrama) existen como `record_types` de categoría
   `master_data`, pero el dato vive en `vessels`, `vessel_certificates` y
   `users`/`user_roles`. Falta decidir si esos formularios se **generan** desde esas
   tablas (recomendado: un dato, una fuente) o si se completan a mano y quedan dos
   verdades en paralelo.
6. **`audit_log` guarda la fila completa en cada alta.** Da la trazabilidad más
   completa, pero crece rápido y duplica datos personales. Antes de producción hay
   que definir retención y si conviene guardar solo el diff también en los INSERT.

## 4. Cómo verificar todo esto

```bash
export DATABASE_URL="postgres://usuario@localhost/sgs_dev"
db/scripts/test.sh
```

Recrea el esquema desde cero, carga los 44 tipos de registro del catálogo de
referencia más un buque de demo con registros en los cuatro estados, y verifica una
por una las reglas listadas en `db/README.md`.
