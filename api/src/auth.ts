import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';

const scrypt = promisify(scryptCb) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * Hash de contraseñas y PIN con scrypt de node:crypto — sin dependencias
 * nativas. Formato: `scrypt$<salt base64url>$<hash base64url>`.
 */
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(secret, salt, KEYLEN);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  if (expected.length !== KEYLEN) return false;
  const actual = await scrypt(secret, Buffer.from(saltB64, 'base64url'), KEYLEN);
  return timingSafeEqual(expected, actual);
}

export interface SessionPayload {
  sub: string; // user id
  exp: number; // epoch segundos
}

export function signToken(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyToken(token: string, secret: string): SessionPayload {
  const [body, mac] = token.split('.');
  if (!body || !mac) throw new HttpError(401, 'Token inválido');

  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new HttpError(401, 'Token inválido');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
  if (payload.exp * 1000 < Date.now()) throw new HttpError(401, 'La sesión expiró');
  return payload;
}

export interface CurrentUser {
  id: string;
  fullName: string;
  /** Empresa propia; null para un asesor externo que trabaja para varias. */
  companyId: string | null;
  /** Empresas sobre las que puede operar (la propia + las de sus roles vigentes). */
  companies: string[];
  roles: { code: string; companyId: string; vesselId: string | null }[];
  /** Alguno de sus roles vigentes habilita a editar el catálogo. */
  canManageCatalog: boolean;
}

export async function loadUser(db: Db, userId: string): Promise<CurrentUser> {
  const { rows } = await db.query<{
    id: string;
    full_name: string;
    company_id: string | null;
    status: string;
    roles:
      | { code: string; company_id: string; vessel_id: string | null; can_manage_catalog: boolean }[]
      | null;
  }>(
    `SELECT u.id, u.full_name, u.company_id, u.status,
            (SELECT json_agg(json_build_object('code', ur.role_code,
                                               'company_id', ur.company_id,
                                               'vessel_id', ur.vessel_id,
                                               'can_manage_catalog', r.can_manage_catalog))
               FROM user_roles ur
               JOIN roles r ON r.code = ur.role_code
              WHERE ur.user_id = u.id
                AND ur.valid_from <= current_date
                AND (ur.valid_to IS NULL OR ur.valid_to >= current_date)) AS roles
       FROM users u
      WHERE u.id = $1`,
    [userId],
  );

  const row = rows[0];
  if (!row) throw new HttpError(401, 'Usuario inexistente');
  if (row.status !== 'activo') throw new HttpError(403, 'El usuario está inactivo');

  const roles = (row.roles ?? []).map((r) => ({
    code: r.code,
    companyId: r.company_id,
    vesselId: r.vessel_id,
  }));
  const companies = [...new Set([row.company_id, ...roles.map((r) => r.companyId)])].filter(
    (c): c is string => c !== null,
  );

  return {
    id: row.id,
    fullName: row.full_name,
    companyId: row.company_id,
    companies,
    roles,
    canManageCatalog: (row.roles ?? []).some((r) => r.can_manage_catalog),
  };
}
