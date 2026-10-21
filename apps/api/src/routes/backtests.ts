import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@mechi/database';
import { backtestRequestSchema } from '@mechi/domain';
import { summarize } from '@mechi/evaluation';
import { enqueue } from '@mechi/jobs';
import { pageQuery, predictionView } from '../serialize';

export async function backtestRoutes(app: FastifyInstance) {
  app.post('/backtests', { schema: { tags: ['Backtesting'], summary: 'Queue a historical backtest' } }, async (request, reply) => {
    const body = backtestRequestSchema.parse(request.body);
    const available = await db.season.findMany({ where: { competitionId: { in: body.competitions }, year: { in: body.seasons }, available: true } });
    if (available.length !== new Set(body.competitions).size * new Set(body.seasons).size) return reply.code(400).send({ error: { code: 'UNAVAILABLE_SEASON', message: 'Every selected competition must support every selected season' } });
    await db.predictionConfig.findUniqueOrThrow({ where: { id: body.predictionConfigId, enabled: true } });
    const run = await db.backtestRun.create({ data: { competitions: body.competitions, seasons: body.seasons, configId: body.predictionConfigId, cutoffHours: body.cutoffHours, minHistoricalMatches: body.minHistoricalMatches } });
    await enqueue('backtests.execute', { runId: run.id }, `backtest-${run.id}`);
    return reply.code(202).send(run);
  });
  app.get('/backtests', { schema: { tags: ['Backtesting'], summary: 'List backtest runs' } }, async (request) => {
    const { page, limit, skip } = pageQuery(request.query);
    const [items, total] = await Promise.all([db.backtestRun.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit, include: { config: true } }), db.backtestRun.count()]);
    return { items, total, page, limit };
  });
  app.get('/backtests/:id', { schema: { tags: ['Backtesting'], summary: 'Backtest progress' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return db.backtestRun.findUniqueOrThrow({ where: { id }, include: { config: true } });
  });
  app.get('/backtests/:id/predictions', { schema: { tags: ['Backtesting'], summary: 'Backtest prediction records' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { page, limit, skip } = pageQuery(request.query);
    const [items, total] = await Promise.all([db.backtestRunFixture.findMany({ where: { runId: id }, include: { fixture: { include: { competition: true, homeTeam: true, awayTeam: true } }, prediction: { include: { evaluation: true } } }, orderBy: { fixture: { kickoff: 'asc' } }, skip, take: limit }), db.backtestRunFixture.count({ where: { runId: id } })]);
    return { items: items.map((item) => ({ id: item.id, status: item.status, reason: item.reason, fixture: { id: item.fixture.id, kickoff: item.fixture.kickoff, homeTeam: item.fixture.homeTeam, awayTeam: item.fixture.awayTeam, competition: item.fixture.competition, homeScore: item.fixture.homeScore, awayScore: item.fixture.awayScore }, prediction: item.prediction ? predictionView(item.prediction) : null })), total, page, limit };
  });
  app.get('/backtests/:id/metrics', { schema: { tags: ['Backtesting'], summary: 'Backtest evaluation metrics' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const run = await db.backtestRun.findUniqueOrThrow({ where: { id } });
    const rows = await db.backtestRunFixture.findMany({ where: { runId: id, prediction: { evaluation: { isNot: null } } }, include: { prediction: { include: { evaluation: true } } } });
    return { ...summarize(rows.flatMap((row) => row.prediction?.evaluation ? [row.prediction.evaluation] : [])), totalFixtures: run.totalFixtures, completed: run.completedCount, failed: run.failedCount, excluded: run.excludedCount, coverage: run.totalFixtures ? run.completedCount / run.totalFixtures : null, limitation: run.limitation };
  });
  app.post('/backtests/:id/cancel', { schema: { tags: ['Backtesting'], summary: 'Cancel pending backtest work' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await db.backtestRunFixture.updateMany({ where: { runId: id, status: 'QUEUED' }, data: { status: 'EXCLUDED', reason: 'Run cancelled' } });
    return db.backtestRun.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
  });
  app.post('/backtests/:id/resume', { schema: { tags: ['Backtesting'], summary: 'Resume pending or failed backtest work' } }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const run = await db.backtestRun.findUniqueOrThrow({ where: { id } });
    if (run.status !== 'CANCELLED' && run.status !== 'FAILED' && run.status !== 'COMPLETED_WITH_ERRORS') return reply.code(409).send({ error: { code: 'NOT_RESUMABLE', message: 'This run does not need resuming' } });
    const items = await db.backtestRunFixture.findMany({ where: { runId: id, status: { in: ['QUEUED', 'FAILED', 'EXCLUDED'] } } });
    await db.backtestRun.update({ where: { id }, data: { status: 'RUNNING', completedAt: null } });
    if (!items.length) await enqueue('backtests.execute', { runId: id }, `backtest-resume-${id}-${randomUUID()}`);
    for (const item of items) { await db.backtestRunFixture.update({ where: { id: item.id }, data: { status: 'QUEUED', reason: null } }); await enqueue('backtests.process-match', { runFixtureId: item.id }, `backtest-retry-${item.id}-${randomUUID()}`); }
    return reply.code(202).send({ resumed: items.length });
  });
}
