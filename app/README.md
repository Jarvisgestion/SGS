# Prototipo de aplicación — Plataforma SGS

API y cliente de referencia sobre el esquema de `db/`. Node 20+, TypeScript y
PostgreSQL. Sin ORM y sin framework de frontend: el objetivo es demostrar que el
modelo dinámico funciona de punta a punta, no fijar todavía el stack definitivo.

## Puesta en marcha

```bash
# 1. Base de datos (desde la raíz del repo)
export DATABASE_URL="postgres://usuario@localhost/sgs_dev"   # usuario dueño
db/scripts/reset.sh
psql "$DATABASE_URL" -f db/seed/01_catalogo_referencia.sql
psql "$DATABASE_URL" -f db/seed/02_demo_operacion.sql
db/scripts/create-app-role.sh          # crea sgs_web, el rol con el que corre la app

# 2. Aplicación
cd app
npm install
npm run build
DATABASE_URL="postgres://sgs_web@localhost/sgs_dev" node dist/scripts/seed-credenciales.js
DATABASE_URL="postgres://sgs_web@localhost/sgs_dev" SESSION_SECRET=algo npm start
# http://localhost:3000
```

**La app se conecta con `sgs_web`, nunca con el dueño de las tablas.** El dueño
saltea Row Level Security y el aislamiento entre empresas dejaría de existir.

### Usuarios de demo

| Correo | Rol | PIN |
|---|---|---|
| `capitan@demo.local` | Capitán | 2345 |
| `pd@demo.local` | Persona Designada | 1234 |
| `jm@demo.local` | Jefe de Máquinas | 3456 |
| `guardia@demo.local` | Guardia de puerto | 4567 |

Contraseña de todos: `demo1234`.

## Pruebas

```bash
npm run smoke      # 30 comprobaciones sobre la API, con el servidor corriendo
npm run ui-check   # recorre la interfaz con un navegador real (requiere playwright)
```

`smoke` recorre el ciclo real de trabajo: el capitán carga un registro a bordo, lo
firma con PIN y lo envía; el PD lo observa desde tierra; el buque lo corrige y lo
reenvía; el PD lo aprueba y queda cerrado e inmodificable. De paso comprueba que
cada regla del esquema llega al cliente como un error HTTP con sentido.

## Cómo está armado

```
src/
  config.ts     Configuración por variables de entorno
  db.ts         Pool y withTenant(): el único camino a los datos operativos
  auth.ts       Hash scrypt, token de sesión firmado, middleware de sesión
  errors.ts     Traducción de errores de Postgres a códigos HTTP
  routes/       auth · catalog · records · reports
public/
  form.js       Renderiza cualquier formulario desde su field_schema
  app.js        Vistas, navegación y borradores locales
```

### `withTenant`: dónde vive el aislamiento

Toda lectura o escritura de datos operativos pasa por `withTenant()`, que abre una
transacción y fija `sgs.current_company_id` y `sgs.current_user_id`. Las consultas
**no filtran por empresa**: eso lo hace RLS en la base. Si mañana alguien escribe
un `SELECT` sin `WHERE company_id`, no filtra datos de otra empresa — no ve nada.

Las dos excepciones son deliberadas y están acotadas a funciones `SECURITY DEFINER`
del esquema (`sgs_auth_by_email`, `sgs_auth_by_id`): el login ocurre antes de saber
de qué empresa es el usuario, así que necesita una puerta explícita.

### El renderizador de formularios

`public/form.js` no menciona ni un solo código de registro. Recibe el `field_schema`
del catálogo y arma el formulario: texto, número, fecha, selección, casillas,
checklists, **tablas de filas dinámicas**, bloques de firma, referencias a la matriz
de riesgo y a usuarios. Cuando una empresa agrega un formulario nuevo a su catálogo,
la aplicación ya lo sabe mostrar sin tocar código.

Lo mismo con `triggers_record_type`: cuando un campo booleano marcado así se tilda
(por ejemplo "hubo heridos" en un incendio), la interfaz ofrece crear el registro
enlazado. La regla está en el catálogo, no en el código.

### Errores

Los mensajes de error del esquema están escritos en castellano y pensados para que
los lea una persona ("faltan campos obligatorios: descripcion"), así que la API los
pasa tal cual. La regla vive en un solo lugar: la base.

## Lo que el prototipo no hace

- **No hace cumplir `signature_requirement`.** Nada impide todavía aprobar un
  registro al que le falta una firma exigida. Depende de qué acepta PNA
  (`docs/03`, punto abierto 4).
- **Adjuntos.** El esquema tiene la tabla `attachments`; la carga de archivos no
  está implementada.
- **Asesores externos multi-empresa.** El modelo los soporta (`users.company_id`
  nulo), pero falta la pantalla para elegir empresa activa: hoy la API los rechaza
  con un mensaje explícito.
- **Firmas manuscritas como data URL.** Van a la columna `signature_image_url` como
  data URL; en producción corresponde subirlas a un almacenamiento de objetos.
- **Modo offline real.** Hay borradores locales con reenvío idempotente, que es lo
  que pedía el requisito, pero no un service worker ni una app instalable.
