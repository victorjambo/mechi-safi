import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '@mechi/config';
import { db } from '@mechi/database';
import { connection, enqueue, jobNames, queue } from '@mechi/jobs';
import { pageQuery } from '../serialize';

export async function systemRoutes(app: FastifyInstance) {
  app.get(
    '/health/live',
    { schema: { tags: ['System'], summary: 'Liveness probe' } },
    async () => ({ status: 'ok', mockMode: config.MOCK_MODE }),
  );
  app.get(
    '/health/ready',
    { schema: { tags: ['System'], summary: 'Database and queue readiness' } },
    async (_request, reply) => {
      try {
        await db.$queryRaw`SELECT 1`;
        await connection.ping();
        return { status: 'ready' };
      } catch {
        return reply.code(503).send({ status: 'unavailable' });
      }
    },
  );
  app.get(
    '/admin/jobs',
    { schema: { tags: ['Admin'], summary: 'Recent background jobs' } },
    async (request) => {
      const { page, limit, skip } = pageQuery(request.query);
      const [items, total] = await Promise.all([
        db.jobExecution.findMany({ orderBy: { updatedAt: 'desc' }, skip, take: limit }),
        db.jobExecution.count(),
      ]);
      return { items, total, page, limit };
    },
  );
  app.get(
    '/admin/jobs/:id',
    { schema: { tags: ['Admin'], summary: 'Background job details' } },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      return db.jobExecution.findUniqueOrThrow({ where: { id } });
    },
  );
  app.post(
    '/admin/jobs/:id/retry',
    { schema: { tags: ['Admin'], summary: 'Retry a failed background job' } },
    async (request, reply) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const original = await queue.getJob(id);
      if (!original || !jobNames.includes(original.name as any))
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Job payload is no longer retained' } });
      const job = await enqueue(
        original.name as any,
        original.data,
        `manual-retry-${id}-${randomUUID()}`,
      );
      return reply.code(202).send({ jobId: job.id });
    },
  );
  app.get(
    '/settings',
    {
      schema: { tags: ['Settings'], summary: 'Application settings and prediction configurations' },
    },
    async () => ({
      settings: await db.applicationSettings.findUniqueOrThrow({ where: { id: 'default' } }),
      configs: await db.predictionConfig.findMany({ where: { enabled: true } }),
      mockMode: config.MOCK_MODE,
    }),
  );
  app.patch(
    '/settings',
    { schema: { tags: ['Settings'], summary: 'Update timezone and scheduling settings' } },
    async (request) => {
      const body = z
        .object({
          timezone: z
            .string()
            .refine((value) => {
              try {
                Intl.DateTimeFormat(undefined, { timeZone: value });
                return true;
              } catch {
                return false;
              }
            })
            .optional(),
          automaticPredictions: z.boolean().optional(),
          automaticCutoffHours: z.number().int().min(1).max(168).optional(),
        })
        .parse(request.body);
      return db.applicationSettings.update({ where: { id: 'default' }, data: body });
    },
  );
}
