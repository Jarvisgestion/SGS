import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadUser, signToken, verifySecret } from '../auth.ts';
import { HttpError } from '../errors.ts';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', {
    /**
     * Freno para el sondeo de contraseñas.
     *
     * La clave combina IP y cuenta a propósito: limitar sólo por IP haría que
     * en un buque o una oficina —donde todos salen por la misma— una persona
     * dejara afuera a las demás. Detrás de un balanceador hace falta
     * SGS_TRUST_PROXY para que el IP sea el real y no el del proxy.
     */
    config: {
      rateLimit: {
        max: app.config.loginRateLimit,
        timeWindow: '1 minute',
        keyGenerator: (req: { ip: string; body?: unknown }) =>
          `${req.ip}:${((req.body as { email?: string } | undefined)?.email ?? '').toLowerCase()}`,
      },
    },
  }, async (req) => {
    const { email, password } = loginBody.parse(req.body);

    const { rows } = await app.db.query<{ id: string; password_hash: string | null }>(
      'SELECT id, password_hash FROM users WHERE email = $1 AND status = $2',
      [email, 'activo'],
    );

    // Se verifica igual cuando el usuario no existe, para no filtrar por tiempo
    // de respuesta qué emails están dados de alta.
    const ok = await verifySecret(password, rows[0]?.password_hash ?? null);
    if (!ok || !rows[0]) throw new HttpError(401, 'Email o contraseña incorrectos');

    const user = await loadUser(app.db, rows[0].id);
    const exp = Math.floor(Date.now() / 1000) + app.config.sessionTtlSeconds;

    return {
      token: signToken({ sub: user.id, exp }, app.config.sessionSecret),
      expires_at: new Date(exp * 1000).toISOString(),
      user: {
        id: user.id,
        full_name: user.fullName,
        companies: user.companies,
        roles: user.roles,
        can_manage_catalog: user.canManageCatalog,
      },
    };
  });
}
