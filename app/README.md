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
npm run smoke      # 47 comprobaciones sobre la API, con el servidor corriendo
npm run ui-check   # recorre la interfaz con un navegador real (requiere playwright)
```

`smoke` recorre el ciclo real de trabajo: el capitán carga un registro a bordo, lo
firma con PIN y lo envía; el PD lo observa desde tierra; el buque lo corrige y lo
reenvía; el PD lo aprueba y queda cerrado e inmodificable. Después recorre el
circuito del piloto: el PD intenta aprobar un zafarrancho y el sistema lo rechaza
porque falta el papel firmado; el capitán adjunta el PDF; el PD descarga exactamente
el mismo archivo y recién ahí aprueba. De paso comprueba que cada regla del esquema
llega al cliente como un error HTTP con sentido.

## Cómo está armado

```
src/
  config.ts     Configuración por variables de entorno
  db.ts         Pool y withTenant(): el único camino a los datos operativos
  auth.ts       Hash scrypt, token de sesión firmado, middleware de sesión
  errors.ts     Traducción de errores de Postgres a códigos HTTP
  routes/       auth · catalog · records · reports
  storage.ts    Almacén de archivos: guarda el formulario firmado y su SHA-256
public/
  form.js       Renderiza cualquier formulario desde su field_schema
  print.js      Arma el formulario impreso, con el encabezado y el pie del MGS
  app.js        Vistas, navegación, adjuntos y borradores locales
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

### Alcance: piloto de PE-01

La aplicación está acotada a PE-01 mientras se valida el circuito completo en uso
real. El recorte es una variable de entorno, no una migración:

```
PILOT_PROCEDURES=PE-01     # vaciarla vuelve a habilitar todo el catálogo
```

Se aplica al catálogo y al reporte de cumplimiento. **No** a la bandeja de revisión
ni al listado: esconder trabajo pendiente sería peor que mostrarlo. Ver
`docs/05-piloto-pe-01.md`.

### Adjuntos: el formulario en papel firmado

La firma digital no está habilitada por PNA, así que la evidencia válida es el
formulario en papel firmado a mano, escaneado o fotografiado. Se sube al registro y
sin él un RE-01A no se puede aprobar (la regla la hace cumplir la base, no la API).

El archivo viaja como binario crudo, sin multipart, para no sumar una dependencia:
el navegador manda el `File` tal cual y el nombre va por query.

```
POST /api/records/:id/attachments?fileName=...&kind=formulario_firmado
Content-Type: application/pdf | image/jpeg | image/png | image/heic | image/webp
```

Se guarda en `ATTACHMENTS_DIR` con su SHA-256, para poder demostrar más adelante
que el archivo exhibido es el mismo que subió el buque. La descarga
(`GET /api/attachments/:id`) exige sesión y pasa por RLS como cualquier otro dato.

### Impresión

`public/print.js` arma el formulario impreso desde el mismo `field_schema` con el
que se cargó el registro, reproduciendo el encabezado y el pie del MGS. Se imprime
desde el navegador (Ctrl+P → guardar como PDF). Generar los PDF en el servidor
—para envío por correo o exportación en lote— sería un paso aparte que no cambia
esta vista.

## Lo que el prototipo no hace

- **No hace cumplir `signature_requirement`.** Mientras la firma digital no esté
  habilitada por PNA, la regla que importa es la del respaldo en papel, y esa sí
  se hace cumplir.
- **Asesores externos multi-empresa.** El modelo los soporta (`users.company_id`
  nulo), pero falta la pantalla para elegir empresa activa: hoy la API los rechaza
  con un mensaje explícito. En pausa hasta evaluar el piloto.
- **Firmas manuscritas como data URL.** Van a la columna `signature_image_url` como
  data URL; en producción corresponde subirlas al mismo almacén que los adjuntos.
- **Modo offline real.** Hay borradores locales con reenvío idempotente, que es lo
  que pedía el requisito, pero no un service worker ni una app instalable.
- **Almacenamiento de archivos en disco local.** Sirve para el piloto; en producción
  va a un almacenamiento de objetos. La interfaz de `src/storage.ts` no cambia.
