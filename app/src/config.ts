/**
 * La conexión de la aplicación NO puede ser la del dueño de las tablas: el dueño
 * saltea Row Level Security y el aislamiento entre empresas dejaría de existir.
 *
 * Los proveedores administrados (Railway, Render, Neon) entregan una sola
 * credencial, que es la del dueño. Por eso el arranque crea un rol aparte y acá
 * se reescriben las credenciales de la URL para usarlo.
 */
function urlDeAplicacion(base: string): string {
  const usuario = process.env.APP_DB_USER;
  if (!usuario) return base;
  try {
    const url = new URL(base);
    url.username = usuario;
    url.password = process.env.APP_DB_PASSWORD ?? '';
    return url.toString();
  } catch {
    return base;
  }
}

const urlBase = process.env.DATABASE_URL ?? 'postgres://sgs_web@localhost:5432/sgs_dev';

export const config = {
  /** Credencial del dueño: solo para migrar y crear el rol de la aplicación. */
  adminDatabaseUrl: urlBase,
  databaseUrl: urlDeAplicacion(urlBase),
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET ?? 'desarrollo-inseguro',
  sessionTtlHours: 12,
  attachmentsDir: process.env.ATTACHMENTS_DIR ?? 'var/attachments',
  maxAttachmentBytes: Number(process.env.MAX_ATTACHMENT_BYTES ?? 25 * 1024 * 1024),
  /**
   * Procedimientos habilitados para carga en esta etapa.
   *
   * El piloto valida el circuito completo con PE-01 antes de abrir el resto del
   * manual. El catálogo de la base sigue teniendo los 44 tipos de registro: esto
   * solo acota lo que la aplicación ofrece. Vaciar la variable habilita todo.
   */
  pilotProcedures: (process.env.PILOT_PROCEDURES ?? 'PE-01')
    .split(',').map((s) => s.trim()).filter(Boolean),
};

if (config.sessionSecret === 'desarrollo-inseguro' && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET es obligatorio fuera de desarrollo');
}
