import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { HealthResponse } from '@arena/contracts';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });

  app.get('/health', async (): Promise<HealthResponse> => {
    return {
      service: 'pricing',
      status: 'ok',
      time: new Date().toISOString(),
    };
  });

  return app;
}
