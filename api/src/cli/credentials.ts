/**
 * Alta de contraseña y PIN de un usuario.
 *
 *   npm run credentials -- --email capitan@ejemplo.com --password '...' --pin 1234
 *
 * Provisorio: cuando se defina el proveedor de identidad, el alta de
 * credenciales sale de acá (ver docs/03-esquema-sql.md §6, punto 4).
 */
import { parseArgs } from 'node:util';
import { hashSecret } from '../auth.ts';
import { createPool } from '../db.ts';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    pin: { type: 'string' },
  },
});

if (!values.email || (!values.password && !values.pin)) {
  console.error('Uso: --email <email> [--password <clave>] [--pin <pin>]');
  process.exit(1);
}
if (values.pin && !/^\d{4,8}$/.test(values.pin)) {
  console.error('El PIN debe tener entre 4 y 8 dígitos');
  process.exit(1);
}

const db = createPool(process.env.DATABASE_URL);
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
await db.end();

if (rowCount === 0) {
  console.error(`No hay ningún usuario con el email ${values.email}`);
  process.exit(1);
}
console.log(`Credenciales actualizadas para ${values.email}`);
