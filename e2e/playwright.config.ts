import { defineConfig } from '@playwright/test';
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
      // El setup corre antes de levantar la API para garantizar el orden.
      command:
        'node --experimental-strip-types ../e2e/setup.ts && node --experimental-strip-types src/server.ts',
      cwd: path.join(raiz, 'api'),
      port: 3000,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: `postgres:///${DB}`,
        SGS_SESSION_SECRET: 'secreto-de-prueba-de-al-menos-32-caracteres',
        PORT: '3000',
      },
    },
    {
      command: 'npm run dev',
      cwd: path.join(raiz, 'client'),
      port: 5173,
      timeout: 90_000,
      reuseExistingServer: false,
    },
    {
      // Build real: es el único donde corre el service worker, que es lo que
      // permite reabrir la app sin señal.
      command: 'npm run build && npm run preview',
      cwd: path.join(raiz, 'client'),
      port: 4173,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
