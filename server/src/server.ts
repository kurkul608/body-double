import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiRoutes } from './routes/api.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await registerApiRoutes(app);
  app.get('/api/health', async () => ({ ok: true }));
  return app;
}
