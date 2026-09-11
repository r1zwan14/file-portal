import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  const port = app.config.PORT;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    const timeout = setTimeout(() => process.exit(1), 10_000);
    timeout.unref();
    await app.close();
    clearTimeout(timeout);
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info({ port }, 'API listening');
    if (app.config.ENABLE_API_DOCS && app.config.NODE_ENV !== 'production') {
      app.log.info({ path: '/docs' }, 'OpenAPI docs enabled');
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
