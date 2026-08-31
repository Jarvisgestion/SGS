import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { errorHandler } from './errors.js';
import { httpsOnly, rateLimit, securityHeaders } from './security.js';
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { recordsRouter } from './routes/records.js';
import { reportsRouter } from './routes/reports.js';
import { pool } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

export const app = express();

// El proveedor termina TLS por delante: sin esto, req.ip sería la del proxy y el
// límite de intentos contaría a todo el mundo como un solo visitante.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(httpsOnly);
app.use(securityHeaders);

// Las firmas manuscritas viajan como data URL de un canvas.
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: (err as Error).message });
  }
});

// Contraseñas y PIN son lo único adivinable a fuerza de intentos.
app.use('/api/auth/login', rateLimit({
  ventanaMs: 10 * 60_000, maximo: 10,
  mensaje: 'Demasiados intentos de ingreso.',
}));
app.use('/api/records/:id/signatures', rateLimit({
  ventanaMs: 10 * 60_000, maximo: 20,
  mensaje: 'Demasiados intentos de firma.',
}));

app.use('/api', authRouter);
app.use('/api', catalogRouter);
app.use('/api', recordsRouter);
app.use('/api', reportsRouter);

// Una ruta de API inexistente es un error, no la portada: devolverle el HTML a
// quien esperaba JSON produce diagnósticos desconcertantes.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Recurso inexistente' });
});

app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.use(errorHandler);

const isMain = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`SGS escuchando en http://localhost:${config.port}`);
  });
}
