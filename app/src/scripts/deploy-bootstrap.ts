/**
 * Preparación de la base al arrancar en un servidor.
 *
 * Los proveedores administrados entregan una sola credencial de PostgreSQL, que
 * es la del dueño de las tablas. Este script la usa para lo único que hace falta
 * —migrar y crear el rol de la aplicación— y deja que el servidor se conecte con
 * ese rol acotado, que sí queda sujeto a Row Level Security.
 *
 * Es idempotente: se ejecuta en cada despliegue y no hace nada si ya está todo.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';
import { hashSecret } from '../auth.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dirMigraciones = path.join(raiz, 'db', 'migrations');
const dirSemilla = path.join(raiz, 'db', 'seed');

const admin = new pg.Client({ connectionString: config.adminDatabaseUrl });
await admin.connect();

const log = (msg: string) => console.log(`[bootstrap] ${msg}`);

// --- 1. Migraciones pendientes -------------------------------------------
await admin.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

const aplicadas = new Set(
  (await admin.query<{ version: string }>('SELECT version FROM schema_migrations')).rows
    .map((r) => r.version),
);
const archivos = fs.readdirSync(dirMigraciones).filter((f) => f.endsWith('.sql')).sort();
let nuevas = 0;
for (const archivo of archivos) {
  const version = archivo.replace(/\.sql$/, '');
  if (aplicadas.has(version)) continue;
  const sql = fs.readFileSync(path.join(dirMigraciones, archivo), 'utf8');
  await admin.query('BEGIN');
  try {
    await admin.query(sql);
    await admin.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    await admin.query('COMMIT');
    log(`migración aplicada: ${version}`);
    nuevas++;
  } catch (err) {
    await admin.query('ROLLBACK');
    throw new Error(`falló la migración ${version}: ${(err as Error).message}`);
  }
}
log(nuevas === 0 ? 'sin migraciones pendientes' : `${nuevas} migración(es) aplicada(s)`);

// --- 2. Rol de la aplicación ---------------------------------------------
const usuarioApp = process.env.APP_DB_USER;
if (usuarioApp) {
  const clave = process.env.APP_DB_PASSWORD;
  if (!clave) throw new Error('APP_DB_USER está definido pero falta APP_DB_PASSWORD');
  if (!/^[a-z_][a-z0-9_]*$/.test(usuarioApp)) {
    throw new Error(`APP_DB_USER inválido: "${usuarioApp}"`);
  }
  // El nombre del rol no puede ir como parámetro; queda validado arriba.
  await admin.query(`DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${usuarioApp}') THEN
        CREATE ROLE ${usuarioApp} LOGIN IN ROLE sgs_app;
      END IF;
    END $$`);
  // La contraseña no puede ir como parámetro en ALTER ROLE: se escapa con la
  // función del propio driver en vez de armar comillas a mano.
  await admin.query(`ALTER ROLE ${usuarioApp} LOGIN PASSWORD ${admin.escapeLiteral(clave)}`);
  await admin.query(`GRANT sgs_app TO ${usuarioApp}`);
  log(`rol de aplicación listo: ${usuarioApp} (miembro de sgs_app, sin propiedad sobre las tablas)`);
} else {
  log('ATENCIÓN: sin APP_DB_USER la aplicación se conecta como dueño de las tablas '
    + 'y Row Level Security no la alcanza. Definilo antes de usar esto con datos reales.');
}

// --- 3. Semilla, solo si la base está vacía -------------------------------
const conteo = await admin.query<{ count: string }>(
  'SELECT count(*)::text AS count FROM companies');

if (Number(conteo.rows[0]?.count ?? 0) > 0) {
  log('la base ya tiene datos: no se toca');
} else if (process.env.SEED_DEMO === 'false') {
  log('base vacía y SEED_DEMO=false: no se carga la semilla');
} else {
  for (const archivo of fs.readdirSync(dirSemilla).filter((f) => f.endsWith('.sql')).sort()) {
    await admin.query(fs.readFileSync(path.join(dirSemilla, archivo), 'utf8'));
    log(`semilla cargada: ${archivo}`);
  }

  // Credenciales de los usuarios de demostración. Si no se indica una clave,
  // se genera una al azar y se imprime una sola vez en el log del despliegue:
  // así una instalación pública no queda con la contraseña de ejemplo.
  const clave = process.env.DEMO_PASSWORD ?? crypto.randomBytes(9).toString('base64url');
  const pines: Record<string, string> = {
    'pd@demo.local': '1234', 'capitan@demo.local': '2345',
    'jm@demo.local': '3456', 'guardia@demo.local': '4567',
  };
  for (const [email, pin] of Object.entries(pines)) {
    await admin.query(
      'UPDATE users SET password_hash = $2, pin_hash = $3 WHERE lower(email) = lower($1)',
      [email, hashSecret(clave), hashSecret(pin)],
    );
  }
  log('----------------------------------------------------------');
  log(`usuarios de demostración: ${Object.keys(pines).join(', ')}`);
  log(`contraseña: ${clave}`);
  log('PIN: PD 1234 · Capitán 2345 · Jefe de Máquinas 3456 · Guardia 4567');
  log('Anotá la contraseña: no se vuelve a mostrar.');
  log('----------------------------------------------------------');
}

// --- 4. Reasignar credenciales de demostración ---------------------------
// Sirve cuando la base ya tiene datos y la contraseña generada en un despliegue
// anterior se perdió. No borra ni modifica ningún registro: solo reescribe el
// hash de la contraseña y el PIN de los cuatro usuarios de demostración.
//
// Alcanza únicamente a las cuentas @demo.local. Es a propósito: así esta variable
// no puede usarse para apropiarse de la cuenta de una persona real.
const CUENTAS_DEMO: Record<string, string> = {
  'pd@demo.local': '1234', 'capitan@demo.local': '2345',
  'jm@demo.local': '3456', 'guardia@demo.local': '4567',
};

const nuevaClave = process.env.RESET_DEMO_PASSWORD;
if (nuevaClave) {
  const actualizados: string[] = [];
  for (const [email, pin] of Object.entries(CUENTAS_DEMO)) {
    const res = await admin.query<{ full_name: string }>(
      `UPDATE users SET password_hash = $2, pin_hash = $3, status = 'activo'
        WHERE lower(email) = lower($1) RETURNING full_name`,
      [email, hashSecret(nuevaClave), hashSecret(pin)],
    );
    if (res.rows[0]) actualizados.push(`${email} (${res.rows[0].full_name})`);
  }

  log('----------------------------------------------------------');
  if (actualizados.length === 0) {
    log('RESET_DEMO_PASSWORD está definida pero no existe ninguna cuenta @demo.local.');
    log('La base tiene datos de otra procedencia: revisá qué usuarios hay cargados.');
  } else {
    log(`contraseña reasignada a ${actualizados.length} cuenta(s) de demostración:`);
    for (const a of actualizados) log(`  ${a}`);
    log('PIN: PD 1234 · Capitán 2345 · Jefe de Máquinas 3456 · Guardia 4567');
    log('QUITÁ la variable RESET_DEMO_PASSWORD: mientras esté, la contraseña se');
    log('reescribe en cada despliegue y queda a la vista de quien lea la configuración.');
  }
  log('----------------------------------------------------------');
} else {
  // Diagnóstico: una cuenta sin contraseña no puede entrar, y desde afuera se ve
  // igual que una contraseña equivocada.
  const sinClave = await admin.query<{ email: string }>(
    `SELECT email FROM users
      WHERE password_hash IS NULL AND lower(email) LIKE '%@demo.local'`);
  if (sinClave.rows.length > 0) {
    log(`cuentas de demostración sin contraseña: ${sinClave.rows.map((r) => r.email).join(', ')}`);
    log('Definí RESET_DEMO_PASSWORD para asignarles una sin tocar el resto de los datos.');
  }
}

// --- 5. Directorio de adjuntos -------------------------------------------
fs.mkdirSync(config.attachmentsDir, { recursive: true });
log(`adjuntos en ${config.attachmentsDir}`);

await admin.end();
log('listo');
