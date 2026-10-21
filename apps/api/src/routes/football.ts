import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@mechi/database';
import { enqueue } from '@mechi/jobs';
import { fixtureInclude, fixtureView, pageQuery, predictionView } from '../serialize';

export async function footballRoutes(app: FastifyInstance) {
  app.get(
    '/competitions',
    { schema: { tags: ['Competitions'], summary: 'List supported competitions' } },
    async () => db.competition.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } }),
  );
  app.get(
    '/competitions/:id/seasons',
    { schema: { tags: ['Competitions'], summary: 'List available seasons' } },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      return db.season.findMany({ where: { competitionId: id }, orderBy: { year: 'desc' } });
    },
  );
  app.get(
    '/fixtures',
    { schema: { tags: ['Fixtures'], summary: 'Search fixtures' } },
    async (request) => {
      const query = z
        .object({
          competition: z.string().optional(),
          from: z.string().datetime().optional(),
          to: z.string().datetime().optional(),
          date: z.string().optional(),
          search: z.string().optional(),
          predictionStatus: z.enum(['all', 'predicted', 'unpredicted']).optional(),
          status: z.string().optional(),
          page: z.coerce.number().optional(),
          limit: z.coerce.number().optional(),
        })
        .parse(request.query);
      const { page, limit, skip } = pageQuery(query);
      const dateFrom = query.date
        ? new Date(`${query.date}T00:00:00Z`)
        : query.from
          ? new Date(query.from)
          : new Date();
      const dateTo = query.date
        ? new Date(dateFrom.getTime() + 86400000)
        : query.to
          ? new Date(query.to)
          : undefined;
      const where: any = {
        kickoff: { gte: dateFrom, ...(dateTo ? { lte: dateTo } : {}) },
        ...(query.competition ? { competitionId: query.competition } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { homeTeam: { name: { contains: query.search, mode: 'insensitive' } } },
                { awayTeam: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(query.predictionStatus === 'predicted'
          ? { predictions: { some: { status: 'SUCCEEDED' } } }
          : query.predictionStatus === 'unpredicted'
            ? { predictions: { none: { status: 'SUCCEEDED' } } }
            : {}),
      };
      const [items, total] = await Promise.all([
        db.fixture.findMany({
          where,
          include: fixtureInclude,
          orderBy: { kickoff: 'asc' },
          skip,
          take: limit,
        }),
        db.fixture.count({ where }),
      ]);
      return { items: items.map(fixtureView), total, page, limit };
    },
  );
  app.get(
    '/fixtures/:id',
    { schema: { tags: ['Fixtures'], summary: 'Fixture details' } },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const fixture = await db.fixture.findUniqueOrThrow({
        where: { id },
        include: fixtureInclude,
      });
      return fixtureView(fixture);
    },
  );
  app.get(
    '/fixtures/:id/predictions',
    { schema: { tags: ['Fixtures'], summary: 'Prediction versions for fixture' } },
    async (request) => {
      const { id } = z.object({ id: z.string() }).parse(request.params);
      const rows = await db.prediction.findMany({
        where: { fixtureId: id },
        include: { evaluation: true, snapshot: true },
        orderBy: { predictedAt: 'asc' },
      });
      return rows.map(predictionView);
    },
  );
  app.post(
    '/admin/fixtures/sync',
    { schema: { tags: ['Admin'], summary: 'Queue fixture synchronization' } },
    async (_request, reply) => {
      const job = await enqueue('fixtures.sync', {}, `manual-sync-${Date.now()}`);
      return reply.code(202).send({ jobId: job.id });
    },
  );
}
