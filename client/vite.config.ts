import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// La API vive bajo /api también en el servidor, así que no se reescribe nada:
// en producción es un solo proceso sirviendo la app y la API.
const proxyApi = { target: 'http://127.0.0.1:3000' };

export default defineConfig({
  plugins: [react()],
  // La API va por el mismo origen que la app: evita CORS y deja que el service
  // worker sirva el armazón sin interferir con las llamadas a `/api`.
  server: { port: 5173, proxy: { '/api': proxyApi } },
  preview: { port: 4173, proxy: { '/api': proxyApi } },
  build: { outDir: 'dist', sourcemap: true },
});
