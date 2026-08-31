import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from './config.js';
import { queryUnscoped } from './db.js';
import { HttpError } from './errors.js';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, SCRYPT_PARAMS.keylen, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifySecret(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(plain, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Token de sesión sin estado: payload + HMAC. Alcanza para el prototipo y evita
 * una tabla de sesiones. Si más adelante hace falta revocar sesiones (una tablet
 * perdida a bordo, por ejemplo), esto pasa a ser una tabla.
 */
export function issueToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: userId, exp: Date.now() + config.sessionTtlHours * 3600_000 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub: string; exp: number };
    if (Date.now() > data.exp) return null;
    return data.sub;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  companyId: string | null;
  fullName: string;
  email: string | null;
  roles: string[];
  defaultVesselId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export async function loadUser(userId: string): Promise<SessionUser | null> {
  // sgs_auth_by_id es SECURITY DEFINER: es la única lectura de `users` que ocurre
  // sin contexto de empresa, porque justamente sirve para averiguar cuál es.
  const rows = await queryUnscoped<{
    id: string; company_id: string | null; full_name: string; email: string | null;
    default_vessel_id: string | null; roles: string[];
  }>('SELECT * FROM sgs_auth_by_id($1)', [userId]);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    fullName: row.full_name,
    email: row.email,
    roles: row.roles ?? [],
    defaultVesselId: row.default_vessel_id,
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) {
    next(new HttpError(401, 'Sesión no válida o vencida'));
    return;
  }
  loadUser(userId)
    .then((user) => {
      if (!user) {
        next(new HttpError(401, 'Usuario inexistente o inactivo'));
        return;
      }
      if (!user.companyId) {
        // Los asesores externos operan sobre varias empresas: falta la pantalla
        // de selección de empresa activa. Fuera del alcance del prototipo.
        next(new HttpError(403, 'Usuario multi-empresa: falta seleccionar empresa activa'));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}
