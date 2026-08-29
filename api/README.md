# API SGS

API HTTP sobre el esquema de `db/`. Node 22 + TypeScript + Fastify + `pg`, sin
ORM: el esquema usa FKs compuestas, triggers y validación de `jsonb` que un ORM
tendría que esquivar, y acá conviene que la base sea la fuente de verdad.

## Arranque

```bash
cd api && npm install
cp .env.example .env          # completar SGS_SESSION_SECRET

createdb sgs_dev
PGDATABASE=sgs_dev ../scripts/db-apply.sh --with-seed

npm start                     # o npm run dev
```

## Usuarios

El seed carga el catálogo, no las personas. El alta se hace con:

```bash
# crear un usuario con su rol
npm run credentials -- --crear --email capitan@empresa.com --nombre "Juan Pérez" \
  --password 'una-clave' --pin 4821 --rol capitan --buque M-0827

# cambiar la clave o el PIN de alguien que ya existe
npm run credentials -- --email capitan@empresa.com --password 'otra-clave'

# ver quién está cargado
npm run credentials -- --listar
```

`--buque` acepta matrícula o nombre; `--empresa` sólo hace falta si hay más de
una cargada. Sin `--rol` el usuario entra pero no puede emitir registros: los
permisos salen de los roles vigentes (ver `docs/03-esquema-sql.md` §3).

```bash
npm test        # levanta una base descartable, aplica migraciones y corre todo
npm run typecheck
```

## Rutas

Todas cuelgan de `/api`. `GET /health`, en cambio, va en la raíz y sin
autenticación, para el chequeo del balanceador.

| Método | Ruta | Para qué |
|---|---|---|
| `POST` | `/auth/login` | Devuelve el token de sesión y los roles vigentes |
| `GET` | `/catalog/record-types` | Catálogo de la empresa |
| `GET` | `/catalog/record-types/:id` | Definición del formulario (`field_schema`) |
| `GET` | `/catalog/vessels` | Buques de la empresa |
| `GET` | `/catalog/risks` | Matriz de riesgo vigente (PO-08) |
| `GET` | `/catalog/crew` | Tripulación, para los campos que citan a una persona |
| `POST` | `/records` | Alta de un registro (nace en borrador) |
| `GET` | `/records` | Listado con filtros (estado, buque, tipo, fechas) |
| `GET` | `/records/:id` | Detalle: datos, formulario congelado, firmas y revisiones |
| `PATCH` | `/records/:id` | Guardado parcial del borrador |
| `POST` | `/records/:id/submit` | Envío a tierra |
| `POST` | `/records/:id/signatures` | Firma de un bloque del formulario |
| `POST` | `/records/:id/reviews` | Aprobar u observar |
| `POST` | `/records/:id/attachments` | Subir un adjunto (multipart) |
| `GET` | `/attachments/:id` | Descargar un adjunto |
| `GET` | `/dashboard/compliance` | RA-06C: qué registros están al día |
| `GET` | `/dashboard/pending-reviews` | Bandeja de revisión |
| `GET` | `/dashboard/certificates` | RMGS-05: vencimientos |
| `GET` | `/dashboard/nonconformities` | Desvíos de checklist |
| `GET` | `/dashboard/pending-children` | Registros que un hecho dejó pendientes |
| `GET/POST` | `/admin/manual-versions` | Revisiones del MGS |
| `POST` | `/admin/manual-versions/:id/publicar` | Poner una revisión en vigencia |
| `GET/POST/PATCH` | `/admin/procedures` | Procedimientos del manual |
| `POST/PATCH` | `/admin/record-types` | Alta y edición de formularios |
| `POST/PATCH` | `/admin/vessels` | Flota |
| `POST/PATCH` | `/admin/risks` | Matriz de evaluación de riesgos |
| `GET/POST/PATCH` | `/admin/users` | Personas |
| `POST/DELETE` | `/admin/users/:id/roles` | Asignar y cerrar roles |

## Cómo está armada

> TypeScript corre directo con `node --experimental-strip-types`: Node **borra**
> los tipos, no los transforma. Eso deja afuera las propiedades declaradas en el
> constructor, los `enum` y los `namespace`; el resto se usa normalmente.


- **Las reglas del dominio no se reimplementan acá.** Quién puede emitir un
  registro, si el formulario está completo, si un registro aprobado se puede
  editar — todo eso lo rechaza la base. `src/errors.ts` traduce el SQLSTATE a
  un HTTP con el mensaje de la base, que ya está escrito para que lo lea una
  persona. La API valida forma (zod) y orquesta; no duplica criterios.
- **Los adjuntos no son públicos.** Se descargan por `GET /attachments/:id`
  con sesión y filtrando por empresa, no por una URL directa del
  almacenamiento: la foto de un accidente o un parte médico no deberían quedar
  accesibles para cualquiera que tenga el enlace. La clave de cada archivo es
  el sha256 de su contenido, así que dos copias iguales ocupan una sola y el
  checksum guardado es el de lo que realmente se escribió.
- **El tipo de archivo se verifica contra los primeros bytes**, no contra lo
  que declara el navegador.
- **La matriz de riesgo tiene su propio permiso** (`roles.can_manage_risk`,
  migración 0011). El Responsable de Seguridad e Higiene la mantiene sin
  administrar el resto del catálogo, y quien administra el catálogo no la toca
  por el solo hecho de administrarlo. Se lee, en cambio, con cualquier rol: un
  registro tiene que poder citar un cuadro aunque quien lo carga no lo edite.
- **Quién puede editar el catálogo lo decide la base.** Las rutas `/admin`
  cortan antes para dar un error claro, pero el permiso está en un trigger
  (`roles.can_manage_catalog`, migración 0009): escribir por SQL con un usuario
  sin ese rol también falla.
- **La empresa se resuelve del token, nunca del body.** Un tripulante tiene una
  sola; un asesor externo elige con la cabecera `X-Company-Id` entre las que sus
  roles vigentes le habilitan.
- **Toda escritura pasa por `withTransaction`**, que declara el actor con
  `SET LOCAL sgs.actor_user_id` para que los triggers de auditoría sepan quién
  hizo cada cosa.
- **El borrador no valida nada.** Es el modo offline: se guarda incompleto y
  recién al enviar el formulario tiene que estar completo, bien tipado y firmado.
- **Contraseñas y PIN con scrypt de `node:crypto`**, sin dependencias nativas.
  El token de sesión es un HMAC-SHA256 sobre `{sub, exp}`.

## Pendientes

1. **Identidad.** El login propio alcanza para arrancar, pero falta decidir el
   proveedor definitivo (y con él, recuperación de contraseña, segundo factor
   para roles de tierra y rotación de PIN). Hoy las credenciales se cargan con
   `npm run credentials`.
2. **Almacenamiento de objetos.** Los adjuntos van hoy a una carpeta del disco
   (`src/storage.ts`). Alcanza para una instancia con un volumen persistente;
   para varias corriendo a la vez hace falta S3 o compatible, que es un archivo
   nuevo detrás de la misma interfaz.
3. **Copiar una revisión del manual.** Al crear la Rev. 05 se arranca de cero:
   falta poder duplicar los procedimientos y formularios de la revisión anterior
   como punto de partida, que es como se trabaja en la práctica.
4. **Paginado por cursor** en `/records` si el volumen lo pide; hoy es
   `limit`/`offset`.
5. **Política de bloqueo de cuenta.** Hoy hay un freno de intentos por minuto
   por IP + cuenta; falta decidir, junto con el proveedor de identidad, si
   corresponde además bloquear la cuenta tras N fallos y cómo se desbloquea.
