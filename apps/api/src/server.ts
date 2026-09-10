import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  const port = app.config.PORT;

  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`API listening on http://localhost:${port}`);
    app.log.info(`OpenAPI docs at http://localhost:${port}/docs`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
