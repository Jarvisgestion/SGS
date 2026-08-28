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

npm run credentials -- --email capitan@ejemplo.com --password '...' --pin 4821
npm start                     # o npm run dev
```

```bash
npm test        # levanta una base descartable, aplica migraciones y corre todo
npm run typecheck
```

## Rutas

| Método | Ruta | Para qué |
|---|---|---|
| `POST` | `/auth/login` | Devuelve el token de sesión y los roles vigentes |
| `GET` | `/catalog/record-types` | Catálogo de la empresa |
| `GET` | `/catalog/record-types/:id` | Definición del formulario (`field_schema`) |
| `GET` | `/catalog/vessels` | Buques de la empresa |
| `POST` | `/records` | Alta de un registro (nace en borrador) |
| `GET` | `/records` | Listado con filtros (estado, buque, tipo, fechas) |
| `GET` | `/records/:id` | Detalle: datos, formulario congelado, firmas y revisiones |
| `PATCH` | `/records/:id` | Guardado parcial del borrador |
| `POST` | `/records/:id/submit` | Envío a tierra |
| `POST` | `/records/:id/signatures` | Firma de un bloque del formulario |
| `POST` | `/records/:id/reviews` | Aprobar u observar |
| `POST` | `/records/:id/attachments` | Registrar un adjunto |
| `GET` | `/dashboard/compliance` | RA-06C: qué registros están al día |
| `GET` | `/dashboard/pending-reviews` | Bandeja de revisión |
| `GET` | `/dashboard/certificates` | RMGS-05: vencimientos |
| `GET` | `/dashboard/nonconformities` | Desvíos de checklist |

## Cómo está armada

- **Las reglas del dominio no se reimplementan acá.** Quién puede emitir un
  registro, si el formulario está completo, si un registro aprobado se puede
  editar — todo eso lo rechaza la base. `src/errors.ts` traduce el SQLSTATE a
  un HTTP con el mensaje de la base, que ya está escrito para que lo lea una
  persona. La API valida forma (zod) y orquesta; no duplica criterios.
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
2. **Subida de archivos.** `POST /records/:id/attachments` registra la
   referencia, no recibe el archivo. Falta elegir el almacenamiento (S3
   compatible) y firmar URLs de subida.
3. **ABM de catálogo y de maestros.** Hoy la API es de lectura sobre el
   catálogo: crear procedimientos, tipos de registro, buques y usuarios se hace
   por SQL. Es lo próximo si se quiere que la empresa edite su manual desde la
   plataforma.
4. **Paginado por cursor** en `/records` si el volumen lo pide; hoy es
   `limit`/`offset`.
5. **Rate limiting en `/auth/login`.**
