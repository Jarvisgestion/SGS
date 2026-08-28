/**
 * Alta de usuarios y de sus credenciales.
 *
 *   # crear un usuario y darle un rol
 *   npm run credentials -- --crear --email capitan@empresa.com --nombre "Juan Pérez" \
 *     --password 'una-clave' --pin 4821 --rol capitan --buque M-0827
 *
 *   # cambiarle la clave o el PIN a alguien que ya existe
 *   npm run credentials -- --email capitan@empresa.com --password 'otra-clave'
 *
 *   # ver qué usuarios hay
 *   npm run credentials -- --listar
 *
 * Provisorio: cuando se defina el proveedor de identidad, el alta de
 * credenciales sale de acá (ver docs/03-esquema-sql.md §6, punto 4).
 */
import { parseArgs } from 'node:util';
import { hashSecret } from '../auth.ts';
import { createPool, withTransaction, type Db } from '../db.ts';

const { values } = parseArgs({
  options: {
    crear: { type: 'boolean', default: false },
    listar: { type: 'boolean', default: false },
    email: { type: 'string' },
    nombre: { type: 'string' },
    password: { type: 'string' },
    pin: { type: 'string' },
    rol: { type: 'string' },
    buque: { type: 'string' },   // matrícula o uuid
    empresa: { type: 'string' }, // razón social o uuid
    dni: { type: 'string' },
  },
});

const db = createPool(process.env.DATABASE_URL);

try {
  if (values.listar) await listar(db);
  else if (values.crear) await crear(db);
  else await actualizar(db);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.end();
}

async function listar(db: Db) {
  const { rows } = await db.query<{
    email: string | null;
    full_name: string;
    empresa: string;
    roles: string | null;
    tiene_clave: boolean;
    tiene_pin: boolean;
  }>(
    `SELECT u.email, u.full_name, c.name AS empresa,
            (SELECT string_agg(ur.role_code, ', ') FROM user_roles ur
              WHERE ur.user_id = u.id AND ur.valid_to IS NULL) AS roles,
            u.password_hash IS NOT NULL AS tiene_clave,
            u.pin_hash IS NOT NULL AS tiene_pin
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
      ORDER BY c.name, u.full_name`,
  );

  if (rows.length === 0) {
    console.log('No hay usuarios cargados. Creá uno con --crear (ver el encabezado de este archivo).');
    return;
  }
  for (const u of rows) {
    console.log(
      `${(u.email ?? '(sin email)').padEnd(32)} ${u.full_name.padEnd(24)} ${(u.empresa ?? '—').padEnd(32)} ` +
        `roles: ${u.roles ?? '—'}  clave: ${u.tiene_clave ? 'sí' : 'no'}  pin: ${u.tiene_pin ? 'sí' : 'no'}`,
    );
  }
}

async function crear(db: Db) {
  if (!values.email || !values.nombre || !values.password) {
    throw new Error('Para crear hacen falta --email, --nombre y --password');
  }
  validarPin();

  await withTransaction(db, null, async (tx) => {
    const empresa = await resolverEmpresa(tx);
    const buque = values.buque ? await resolverBuque(tx, empresa) : null;

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO users (company_id, full_name, email, dni, password_hash, pin_hash, default_vessel_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        empresa.id,
        values.nombre,
        values.email,
        values.dni ?? null,
        await hashSecret(values.password!),
        values.pin ? await hashSecret(values.pin) : null,
        buque?.id ?? null,
      ],
    );

    if (values.rol) {
      await tx.query(
        `INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES ($1, $2, $3, $4)`,
        [rows[0]!.id, values.rol, empresa.id, buque?.id ?? null],
      );
    }

    console.log(
      `Usuario ${values.email} creado en ${empresa.name}` +
        (values.rol ? ` con rol ${values.rol}` : ' (sin rol: no va a poder emitir registros)') +
        (buque ? ` en el buque ${buque.name}` : ''),
    );
  });
}

async function actualizar(db: Db) {
  if (!values.email || (!values.password && !values.pin)) {
    throw new Error(
      'Uso: --email <email> [--password <clave>] [--pin <pin>]\n' +
        '     --crear   para dar de alta un usuario nuevo\n' +
        '     --listar  para ver los usuarios existentes',
    );
  }
  validarPin();

  const { rowCount } = await db.query(
    `UPDATE users
        SET password_hash = COALESCE($2, password_hash),
            pin_hash      = COALESCE($3, pin_hash)
      WHERE email = $1`,
    [
      values.email,
      values.password ? await hashSecret(values.password) : null,
      values.pin ? await hashSecret(values.pin) : null,
    ],
  );

  if (rowCount === 0) throw new Error(`No hay ningún usuario con el email ${values.email}`);
  console.log(`Credenciales actualizadas para ${values.email}`);
}

function validarPin() {
  if (values.pin && !/^\d{4,8}$/.test(values.pin)) {
    throw new Error('El PIN debe tener entre 4 y 8 dígitos');
  }
}

/** Si hay una sola empresa se usa esa; si hay varias hay que decir cuál. */
async function resolverEmpresa(tx: import('../db.ts').Tx) {
  const { rows } = await tx.query<{ id: string; name: string }>(
    values.empresa
      ? `SELECT id, name FROM companies WHERE id::text = $1 OR name ILIKE $1`
      : `SELECT id, name FROM companies WHERE status = 'activo'`,
    values.empresa ? [values.empresa] : [],
  );

  if (rows.length === 1) return rows[0]!;
  if (rows.length === 0) {
    throw new Error(
      values.empresa
        ? `No encontramos la empresa "${values.empresa}"`
        : 'No hay ninguna empresa cargada. Corré ./scripts/db-apply.sh --with-seed',
    );
  }
  throw new Error(
    `Hay varias empresas, indicá cuál con --empresa:\n${rows.map((c) => `  - ${c.name}`).join('\n')}`,
  );
}

async function resolverBuque(tx: import('../db.ts').Tx, empresa: { id: string }) {
  const { rows } = await tx.query<{ id: string; name: string }>(
    `SELECT id, name FROM vessels
      WHERE company_id = $1 AND (id::text = $2 OR upper(matricula) = upper($2) OR name ILIKE $2)`,
    [empresa.id, values.buque],
  );
  if (!rows[0]) throw new Error(`No encontramos el buque "${values.buque}" en esa empresa`);
  return rows[0];
}
