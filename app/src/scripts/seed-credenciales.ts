/**
 * Asigna contraseña y PIN a los usuarios de la semilla de demo.
 *
 * El hash vive acá y no en el SQL porque el esquema de hashing (scrypt) es una
 * decisión de la aplicación: la base guarda el resultado, no el método.
 *
 * Uso: DATABASE_URL=... node dist/scripts/seed-credenciales.js
 */
import { pool } from '../db.js';
import { hashSecret } from '../auth.js';

const DEMO = [
  { email: 'pd@demo.local',      password: 'demo1234', pin: '1234' },
  { email: 'capitan@demo.local', password: 'demo1234', pin: '2345' },
  { email: 'jm@demo.local',      password: 'demo1234', pin: '3456' },
  { email: 'guardia@demo.local', password: 'demo1234', pin: '4567' },
];

const rows = await Promise.all(DEMO.map(async (u) => {
  const res = await pool.query(
    `UPDATE users SET password_hash = $2, pin_hash = $3 WHERE lower(email) = lower($1)
     RETURNING full_name, email`,
    [u.email, hashSecret(u.password), hashSecret(u.pin)],
  );
  return res.rows[0];
}));

for (const r of rows) {
  if (r) console.log(`credenciales asignadas: ${r.full_name} <${r.email}>`);
}
console.log('\nContraseña de todos: demo1234');
console.log('PIN: PD 1234 · Capitán 2345 · Jefe de Máquinas 3456 · Guardia 4567');
await pool.end();
