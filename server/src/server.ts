import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { rootPackageJsonPath } from './paths.js';
import { registerApiRoutes } from './routes/api.js';

const { version } = JSON.parse(readFileSync(rootPackageJsonPath, 'utf8')) as { version: string };

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await registerApiRoutes(app);
  app.get('/api/health', async () => ({ ok: true, version }));
  return app;
}
