export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://sgs_web@localhost:5432/sgs_dev',
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
