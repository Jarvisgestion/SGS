/**
 * Prepara el entorno de la prueba de punta a punta: base descartable con el
 * esquema y el catálogo de demostración, más los usuarios con credenciales.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashSecret } from '../api/src/auth.ts';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = process.env.SGS_E2E_DB ?? 'sgs_e2e';

import { CREDENCIALES } from './credenciales.ts';

const COMPANIA = '11111111-1111-1111-1111-111111111111';
const BUQUE = '22222222-2222-2222-2222-222222222222';

execFileSync('dropdb', ['--if-exists', '--force', DB], { stdio: 'inherit' });
execFileSync('createdb', [DB], { stdio: 'inherit' });
execFileSync(path.join(raiz, 'scripts/db-apply.sh'), ['--with-seed'], {
  env: { ...process.env, PGDATABASE: DB, DATABASE_URL: '' },
  stdio: 'pipe',
});

const db = new pg.Pool({ connectionString: `postgres:///${DB}` });

async function crear(nombre: string, cred: { email: string; password: string; pin: string }, rol: string, buque: string | null) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (company_id, full_name, email, password_hash, pin_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [COMPANIA, nombre, cred.email, await hashSecret(cred.password), await hashSecret(cred.pin)],
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES ($1, $2, $3, $4)`,
    [rows[0]!.id, rol, COMPANIA, buque],
  );
}

await crear('Capitán de prueba', CREDENCIALES.capitan, 'capitan', BUQUE);
await crear('Persona Designada', CREDENCIALES.pd, 'persona_designada', null);

// Un certificado vencido, para que el tablero tenga algo que mostrar.
await db.query(
  `INSERT INTO vessel_certificates (company_id, vessel_id, certificate_label, certificate_number, expires_at)
   VALUES ($1, $2, 'Certificado de Seguridad de la Navegación', 'CSN-1', current_date - 5)`,
  [COMPANIA, BUQUE],
);

await db.end();
console.log(`base ${DB} lista`);
