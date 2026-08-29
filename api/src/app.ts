import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { loadUser, verifyToken, type CurrentUser } from './auth.ts';
import type { Config } from './config.ts';
import { createPool, type Db } from './db.ts';
import { AlmacenamientoEnDisco, type Almacenamiento } from './storage.ts';
import { HttpError, toHttpError } from './errors.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { catalogRoutes } from './routes/catalog.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { attachmentRoutes } from './routes/attachments.ts';
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
    almacenamiento: Almacenamiento;
  }
}

export interface AppOptions {
  config: Config;
  db?: Db;
  logger?: boolean;
  almacenamiento?: Almacenamiento;
}

export async function buildApp({
  config,
  db,
  logger = false,
  almacenamiento,
}: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger, bodyLimit: 2 * 1024 * 1024, trustProxy: config.trustProxy });

  app.decorate('db', db ?? createPool(config.databaseUrl));
  app.decorate('config', config);
  app.decorate('almacenamiento', almacenamiento ?? new AlmacenamientoEnDisco(config.storageDir));
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

  await app.register(helmet, {
    // La app y la API son del mismo origen y no cargan nada de afuera.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // React escribe estilos en el atributo style; las firmas son data: URL.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // hook preHandler: el limitador necesita el body para distinguir por cuenta.
  await app.register(rateLimit, { global: false, hook: 'preHandler' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1 } });

  /** Para el balanceador: fuera del prefijo y sin autenticación. */
  app.get('/health', async () => {
    await app.db.query('SELECT 1');
    return { status: 'ok' };
  });

  await app.register(
    async (apiScope) => {
      apiScope.get('/health', async () => {
        await apiScope.db.query('SELECT 1');
        return { status: 'ok' };
      });

      apiScope.register(authRoutes, { prefix: '/auth' });

      // Todo lo demás exige sesión y una empresa resuelta.
      apiScope.register(async (secured) => {
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
        secured.register(attachmentRoutes, { prefix: '/attachments' });
        secured.register(adminRoutes, { prefix: '/admin' });
      });
    },
    { prefix: '/api' },
  );

  if (config.clientDir) await servirApp(app, config.clientDir);

  return app;
}

/**
 * Sirve el build de la app desde el mismo proceso. Las rutas de la aplicación
 * viven en el hash, así que cualquier ruta desconocida devuelve el index; una
 * ruta de API que no existe sigue devolviendo 404 en JSON.
 */
async function servirApp(app: FastifyInstance, clientDir: string) {
  await app.register(fastifyStatic, {
    root: clientDir,
    index: ['index.html'],
    setHeaders(reply, ruta) {
      // Los assets llevan hash en el nombre: se pueden cachear para siempre.
      // El index y el service worker, nunca: un sw.js viejo en la caché del
      // navegador deja la app clavada en una versión anterior.
      reply.header(
        'cache-control',
        ruta.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.method !== 'GET') {
      return reply.code(404).send({ error: 'No existe esa ruta' });
    }
    return reply.sendFile('index.html');
  });
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
