import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  databaseUrl: string | undefined;
  /** Clave de firma de los tokens de sesión. Sin valor, el proceso no arranca. */
  sessionSecret: string;
  sessionTtlSeconds: number;
  /**
   * Carpeta del build de la app. Si existe, el mismo proceso sirve la API bajo
   * /api y la aplicación en el resto: un solo servicio, mismo origen, sin CORS.
   */
  clientDir: string | null;
  /** Detrás de un balanceador, para que el IP del cliente no sea el del proxy. */
  trustProxy: boolean;
  /** Intentos de login por minuto y por combinación de IP + cuenta. */
  loginRateLimit: number;
  /** Carpeta de los archivos adjuntos. Tiene que ser un volumen persistente. */
  storageDir: string;
  /** Tamaño máximo de un adjunto, en bytes. */
  maxUploadBytes: number;
}

const RAIZ = path.resolve(import.meta.dirname, '..', '..');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const secret = env.SGS_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'Falta SGS_SESSION_SECRET (mínimo 32 caracteres). Generá una con: openssl rand -hex 32',
    );
  }

  const clientDir = env.SGS_CLIENT_DIR ?? path.join(RAIZ, 'client', 'dist');

  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl: env.DATABASE_URL,
    sessionSecret: secret,
    sessionTtlSeconds: Number(env.SGS_SESSION_TTL ?? 60 * 60 * 12),
    clientDir: existsSync(path.join(clientDir, 'index.html')) ? clientDir : null,
    trustProxy: env.SGS_TRUST_PROXY === 'true',
    loginRateLimit: Number(env.SGS_LOGIN_RATE_LIMIT ?? 10),
    storageDir: env.SGS_STORAGE_DIR ?? path.join(RAIZ, 'var', 'attachments'),
    maxUploadBytes: Number(env.SGS_MAX_UPLOAD_BYTES ?? 10 * 1024 * 1024),
  };
}
