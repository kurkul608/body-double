import { env, MISSING_API_KEY_WARNING } from './env.js';
import { buildServer } from './server.js';

const app = await buildServer();

if (!process.env.ANTHROPIC_API_KEY) {
  app.log.warn(MISSING_API_KEY_WARNING);
}

try {
  await app.listen({ port: env.port, host: '127.0.0.1' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
