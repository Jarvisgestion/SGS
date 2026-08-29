import { defineConfig } from '@playwright/test';
import { urlDeBase } from '../api/src/db.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = 'sgs_e2e';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // El entorno trae Chromium preinstalado; se apunta directo al binario para
    // no depender de que la versión de Playwright coincida con la del build.
    launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
      : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      // Un solo proceso, como en producción: la API bajo /api y la app servida
      // desde el mismo origen. El setup corre antes para garantizar el orden.
      command:
        'npm --prefix ../client run build && ' +
        'node --experimental-strip-types ../e2e/setup.ts && ' +
        'node --experimental-strip-types src/server.ts',
      cwd: path.join(raiz, 'api'),
      port: 3000,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: urlDeBase(DB),
        SGS_SESSION_SECRET: 'secreto-de-prueba-de-al-menos-32-caracteres',
        SGS_CLIENT_DIR: path.join(raiz, 'client', 'dist'),
        // Los tests entran y salen muchas veces con la misma cuenta; el freno
        // al sondeo de contraseñas se prueba aparte, en api/test/api.test.ts.
        SGS_LOGIN_RATE_LIMIT: '1000',
        PORT: '3000',
      },
    },
    {
      // El servidor de desarrollo, contra el que corre la mayoría de los tests.
      command: 'npm run dev',
      cwd: path.join(raiz, 'client'),
      port: 5173,
      timeout: 90_000,
      reuseExistingServer: false,
    },
  ],
});
