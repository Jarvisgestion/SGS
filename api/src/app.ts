import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadUser, verifyToken, type CurrentUser } from './auth.ts';
import type { Config } from './config.ts';
import { createPool, type Db } from './db.ts';
import { HttpError, toHttpError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { recordRoutes } from './routes/records.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: CurrentUser;
    /** Empresa sobre la que opera este request. */
    companyId: string;
  }
  interface FastifyInstance {
    db: Db;
    config: Config;
  }
}

export interface AppOptions {
  config: Config;
  db?: Db;
  logger?: boolean;
}

export function buildApp({ config, db, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024 });

  app.decorate('db', db ?? createPool(config.databaseUrl));
  app.decorate('config', config);
  app.decorateRequest('user', null as unknown as CurrentUser);
  app.decorateRequest('companyId', '');

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'Datos inválidos',
        detail: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const http = toHttpError(err);
    if (http.statusCode >= 500) app.log.error({ err }, 'error no mapeado');
    return reply.code(http.statusCode).send({ error: http.message, detail: http.detail });
  });

  app.get('/health', async () => {
    await app.db.query('SELECT 1');
    return { status: 'ok' };
  });

  app.register(authRoutes, { prefix: '/auth' });

  // Todo lo demás exige sesión y una empresa resuelta.
  app.register(async (secured) => {
    secured.addHook('preHandler', async (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Falta el token de sesión');

      const payload = verifyToken(header.slice(7), config.sessionSecret);
      req.user = await loadUser(app.db, payload.sub);
      req.companyId = resolveCompany(req.user, req.headers['x-company-id']);
    });

    secured.register(catalogRoutes, { prefix: '/catalog' });
    secured.register(recordRoutes, { prefix: '/records' });
    secured.register(dashboardRoutes, { prefix: '/dashboard' });
    secured.register(adminRoutes, { prefix: '/admin' });
  });

  return app;
}

/**
 * Un tripulante pertenece a una sola empresa; un asesor externo trabaja para
 * varias y elige con la cabecera `X-Company-Id`. En cualquier caso la empresa
 * queda fijada acá y las consultas filtran por ella: ninguna ruta la toma del
 * body.
 */
function resolveCompany(user: CurrentUser, header: string | string[] | undefined): string {
  const requested = Array.isArray(header) ? header[0] : header;

  if (requested) {
    if (!user.companies.includes(requested)) {
      throw new HttpError(403, 'El usuario no opera sobre esa empresa');
    }
    return requested;
  }
  if (user.companies.length === 1) return user.companies[0]!;
  if (user.companies.length === 0) throw new HttpError(403, 'El usuario no tiene empresa asignada');
  throw new HttpError(400, 'Indicá la empresa con la cabecera X-Company-Id');
}
