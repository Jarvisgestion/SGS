import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const app = buildApp({ config, logger: true });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info('cerrando');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port: config.port, host: config.host });
