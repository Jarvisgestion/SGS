export interface Config {
  port: number;
  host: string;
  databaseUrl: string | undefined;
  /** Clave de firma de los tokens de sesión. Sin valor, el proceso no arranca. */
  sessionSecret: string;
  sessionTtlSeconds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = env.SGS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'Falta SGS_SESSION_SECRET (mínimo 32 caracteres). Generá una con: openssl rand -hex 32',
    );
  }
  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL,
    sessionSecret: secret,
    sessionTtlSeconds: Number(env.SGS_SESSION_TTL ?? 60 * 60 * 12),
  };
}
