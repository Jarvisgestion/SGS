export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://sgs_web@localhost:5432/sgs_dev',
  port: Number(process.env.PORT ?? 3000),
  sessionSecret: process.env.SESSION_SECRET ?? 'desarrollo-inseguro',
  sessionTtlHours: 12,
};

if (config.sessionSecret === 'desarrollo-inseguro' && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET es obligatorio fuera de desarrollo');
}
