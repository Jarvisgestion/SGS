import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { hashSecret } from '../src/auth.ts';
import { createPool, type Db } from '../src/db.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const DEMO_COMPANY = '11111111-1111-1111-1111-111111111111';
export const DEMO_VESSEL = '22222222-2222-2222-2222-222222222222';

const SESSION_SECRET = 'x'.repeat(48);

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  dbName: string;
  almacenamiento: string;
}

/** Base descartable con migraciones y seed aplicados. */
export async function setupApi(opciones?: {
  loginRateLimit?: number;
  pinRateLimit?: number;
  maxUploadBytes?: number;
}): Promise<TestContext> {
  const dbName = `sgs_api_test_${randomUUID().slice(0, 8)}`;
  const almacenamiento = path.join(os.tmpdir(), dbName);
  execFileSync('createdb', [dbName], { stdio: 'inherit' });
  execFileSync(path.join(repoRoot, 'scripts/db-apply.sh'), ['--with-seed'], {
    env: { ...process.env, PGDATABASE: dbName, DATABASE_URL: '' },
    stdio: 'pipe',
  });

  const db = createPool(`postgres:///${dbName}`);
  const app = await buildApp({
    config: {
      port: 0,
      host: '127.0.0.1',
      databaseUrl: `postgres:///${dbName}`,
      sessionSecret: SESSION_SECRET,
      sessionTtlSeconds: 3600,
      clientDir: null, // en los tests sólo importa la API
      trustProxy: false,
      loginRateLimit: opciones?.loginRateLimit ?? 1000,
      pinRateLimit: opciones?.pinRateLimit ?? 1000,
      storageDir: almacenamiento,
      maxUploadBytes: opciones?.maxUploadBytes ?? 10 * 1024 * 1024,
      logLevel: 'silent',
    },
    db,
  });
  await app.ready();
  return { app, db, dbName, almacenamiento };
}

export async function teardownApi(ctx: TestContext) {
  await ctx.app.close();
  await ctx.db.end();
  execFileSync('dropdb', ['--force', ctx.dbName], { stdio: 'inherit' });
  await rm(ctx.almacenamiento, { recursive: true, force: true });
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  pin: string;
}

/** Da de alta un usuario con credenciales y un rol vigente. */
export async function createUser(
  db: Db,
  opts: {
    companyId: string;
    fullName: string;
    email: string;
    role?: string;
    vesselId?: string | null;
  },
): Promise<SeededUser> {
  const password = 'clave-de-prueba-123';
  const pin = '4821';

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (company_id, full_name, email, password_hash, pin_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [opts.companyId, opts.fullName, opts.email, await hashSecret(password), await hashSecret(pin)],
  );
  const id = rows[0]!.id;

  if (opts.role) {
    await db.query(
      `INSERT INTO user_roles (user_id, role_code, company_id, vessel_id) VALUES ($1, $2, $3, $4)`,
      [id, opts.role, opts.companyId, opts.vesselId ?? null],
    );
  }
  return { id, email: opts.email, password, pin };
}

export async function login(app: FastifyInstance, user: SeededUser): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: user.email, password: user.password },
  });
  if (res.statusCode !== 200) throw new Error(`login falló: ${res.statusCode} ${res.body}`);
  return res.json().token as string;
}

export function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

export async function recordTypeId(db: Db, code: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM record_types WHERE code = $1 AND company_id = $2',
    [code, DEMO_COMPANY],
  );
  return rows[0]!.id;
}

/** PNG de 1x1 transparente: sirve como archivo real y pesa nada. */
export const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Arma un cuerpo multipart para app.inject, sin dependencias extra. */
export function multipart(
  archivo: Buffer,
  opciones: { filename: string; contentType: string; campo?: string },
) {
  const limite = `----sgs${randomUUID()}`;
  const cabecera = Buffer.from(
    `--${limite}\r\n` +
      `Content-Disposition: form-data; name="${opciones.campo ?? 'archivo'}"; ` +
      `filename="${opciones.filename}"\r\n` +
      `Content-Type: ${opciones.contentType}\r\n\r\n`,
  );
  const cierre = Buffer.from(`\r\n--${limite}--\r\n`);

  return {
    payload: Buffer.concat([cabecera, archivo, cierre]),
    headers: { 'content-type': `multipart/form-data; boundary=${limite}` },
  };
}
