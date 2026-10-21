import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { config, assertProductionConfig } from '@mechi/config';
import { db } from '@mechi/database';
import { connection, queue } from '@mechi/jobs';
import { authenticated, authRoutes } from './auth';
import { footballRoutes } from './routes/football';
import { predictionRoutes } from './routes/predictions';
import { backtestRoutes } from './routes/backtests';
import { analyticsRoutes } from './routes/analytics';
import { systemRoutes } from './routes/system';

assertProductionConfig();
const app = Fastify({ logger: true, trustProxy: process.env.NODE_ENV === 'production' });
await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
await app.register(cookie);
await app.register(swagger, {
  openapi: {
    info: {
      title: 'Mechi Safi API',
      version: '1.0.0',
      description: 'Football prediction benchmark API',
    },
    servers: [{ url: `http://localhost:${config.API_PORT}` }],
  },
});
await app.register(swaggerUi, { routePrefix: '/docs' });
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError)
    return reply
      .code(400)
      .send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() },
      });
  if ((error as any).code === 'P2025')
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  app.log.error(error);
  return reply
    .code(500)
    .send({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
});
app.addHook('onRequest', async (request, reply) => {
  const path = request.url.split('?')[0];
  if (!path?.startsWith('/api/v1/')) return;
  if (path.startsWith('/api/v1/health/') || path.startsWith('/api/v1/auth/')) return;
  if (!authenticated(request))
    return reply
      .code(401)
      .send({ error: { code: 'UNAUTHORIZED', message: 'Sign in to continue' } });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.origin;
    if (origin && origin !== config.WEB_ORIGIN)
      return reply
        .code(403)
        .send({ error: { code: 'BAD_ORIGIN', message: 'Request origin is not allowed' } });
  }
});
await app.register(
  async (api) => {
    await api.register(authRoutes);
    await api.register(footballRoutes);
    await api.register(predictionRoutes);
    await api.register(backtestRoutes);
    await api.register(analyticsRoutes);
    await api.register(systemRoutes);
  },
  { prefix: '/api/v1' },
);
await app.listen({
  port: config.API_PORT,
  host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
});
async function shutdown() {
  await app.close();
  await queue.close();
  await connection.quit();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
