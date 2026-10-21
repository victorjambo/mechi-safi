import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@mechi/database';
import { batchRequestSchema } from '@mechi/domain';
import { enqueue } from '@mechi/jobs';
import { fixtureInclude, fixtureView, pageQuery, predictionView } from '../serialize';

const batchInclude = { config: true, items: { include: { prediction: { include: { evaluation: true } } } } } as const;
function batchView(batch: any) {
  const evaluations = batch.items.flatMap((item: any) => item.prediction?.evaluation ? [item.prediction.evaluation] : []);
  const summary = Object.fromEntries(Object.entries(batch).filter(([key]) => key !== 'items'));
  return { ...summary, completedResults: evaluations.length, accuracy: evaluations.length ? evaluations.filter((row: any) => row.correct).length / evaluations.length : null };
}

export async function predictionRoutes(app: FastifyInstance) {
  app.post('/prediction-batches', { schema: { tags: ['Prediction batches'], summary: 'Queue predictions for an upcoming window' } }, async (request, reply) => {
    const body = batchRequestSchema.parse(request.body);
    const key = z.string().uuid().optional().parse(request.headers['idempotency-key']);
    if (key) { const existing = await db.predictionBatch.findUnique({ where: { requestKey: key } }); if (existing) return reply.code(202).send(existing); }
    const enabled = await db.competition.findMany({ where: { id: { in: body.competitions }, enabled: true, available: true } });
    if (enabled.length !== new Set(body.competitions).size) return reply.code(400).send({ error: { code: 'INVALID_COMPETITION', message: 'Select available enabled competitions' } });
    await db.predictionConfig.findUniqueOrThrow({ where: { id: body.predictionConfigId, enabled: true } });
    const start = new Date();
    const batch = await db.predictionBatch.create({ data: { requestKey: key, periodHours: body.periodHours, windowStart: start, windowEnd: new Date(start.getTime() + body.periodHours * 3600000), competitions: body.competitions, configId: body.predictionConfigId, existingPredictionPolicy: body.existingPredictionPolicy } });
    await enqueue('predictions.generate-batch', { batchId: batch.id }, `batch-${batch.id}`);
    return reply.code(202).send(batch);
  });
  app.get('/prediction-batches', { schema: { tags: ['Prediction batches'], summary: 'List prediction batches' } }, async (request) => {
    const { page, limit, skip } = pageQuery(request.query);
    const [items, total] = await Promise.all([db.predictionBatch.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit, include: batchInclude }), db.predictionBatch.count()]);
    return { items: items.map(batchView), total, page, limit };
  });
  app.get('/prediction-batches/:id', { schema: { tags: ['Prediction batches'], summary: 'Batch progress and summary' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return batchView(await db.predictionBatch.findUniqueOrThrow({ where: { id }, include: batchInclude }));
  });
  app.get('/prediction-batches/:id/predictions', { schema: { tags: ['Prediction batches'], summary: 'Predictions and processing results in a batch' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { page, limit, skip } = pageQuery(request.query);
    const [items, total] = await Promise.all([db.predictionBatchItem.findMany({ where: { batchId: id }, include: { fixture: { include: fixtureInclude }, prediction: { include: { evaluation: true } } }, orderBy: { fixture: { kickoff: 'asc' } }, skip, take: limit }), db.predictionBatchItem.count({ where: { batchId: id } })]);
    return { items: items.map((item) => ({ id: item.id, status: item.status, reason: item.reason, attempts: item.attempts, fixture: fixtureView(item.fixture), prediction: item.prediction ? predictionView(item.prediction) : null })), total, page, limit };
  });
  app.post('/prediction-batches/:id/retry', { schema: { tags: ['Prediction batches'], summary: 'Retry failed batch items' } }, async (request, reply) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const batch = await db.predictionBatch.findUniqueOrThrow({ where: { id } });
    if (batch.status === 'CANCELLED') return reply.code(409).send({ error: { code: 'CANCELLED', message: 'Cannot retry a cancelled batch' } });
    const items = await db.predictionBatchItem.findMany({ where: { batchId: id, status: 'FAILED' } });
    for (const item of items) { await db.predictionBatchItem.update({ where: { id: item.id }, data: { status: 'QUEUED', reason: null } }); await enqueue('predictions.generate-match', { itemId: item.id }, `retry-${item.id}-${randomUUID()}`); }
    await db.predictionBatch.update({ where: { id }, data: { status: 'RUNNING', completedAt: null } });
    return reply.code(202).send({ retried: items.length });
  });
  app.post('/prediction-batches/:id/cancel', { schema: { tags: ['Prediction batches'], summary: 'Cancel pending batch items' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    await db.predictionBatchItem.updateMany({ where: { batchId: id, status: 'QUEUED' }, data: { status: 'EXCLUDED', reason: 'Batch cancelled' } });
    return db.predictionBatch.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
  });
  app.get('/predictions', { schema: { tags: ['Predictions'], summary: 'Search prediction history' } }, async (request) => {
    const query = z.object({ mode: z.enum(['FORWARD', 'BACKTEST', 'DIAGNOSTIC']).optional(), competition: z.string().optional(), search: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(request.query);
    const { page, limit, skip } = pageQuery(query);
    const where: any = { ...(query.mode ? { mode: query.mode } : {}), ...(query.competition ? { fixture: { competitionId: query.competition } } : {}), ...(query.search ? { OR: [{ fixture: { homeTeam: { name: { contains: query.search, mode: 'insensitive' } } } }, { fixture: { awayTeam: { name: { contains: query.search, mode: 'insensitive' } } } }] } : {}) };
    const [items, total] = await Promise.all([db.prediction.findMany({ where, include: { fixture: { include: fixtureInclude }, evaluation: true }, orderBy: { predictedAt: 'desc' }, skip, take: limit }), db.prediction.count({ where })]);
    return { items: items.map(predictionView), total, page, limit };
  });
  app.get('/predictions/:id', { schema: { tags: ['Predictions'], summary: 'Prediction details and input snapshot' } }, async (request) => {
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const row = await db.prediction.findUniqueOrThrow({ where: { id }, include: { fixture: { include: fixtureInclude }, evaluation: true, snapshot: true, config: true } });
    return { ...predictionView(row), config: row.config, rawRequest: row.rawRequest, rawResponse: row.rawResponse };
  });
  app.post('/admin/predictions/:fixtureId/run', { schema: { tags: ['Admin'], summary: 'Queue prediction for one fixture' } }, async (request, reply) => {
    const { fixtureId } = z.object({ fixtureId: z.string() }).parse(request.params);
    const fixture = await db.fixture.findUniqueOrThrow({ where: { id: fixtureId } });
    if (fixture.kickoff <= new Date() || fixture.status !== 'SCHEDULED') return reply.code(409).send({ error: { code: 'INELIGIBLE', message: 'Fixture has started or is not scheduled' } });
    const now = new Date();
    const batch = await db.predictionBatch.create({ data: { periodHours: Math.max(1, Math.ceil((fixture.kickoff.getTime() - now.getTime()) / 3600000)), windowStart: now, windowEnd: fixture.kickoff, competitions: [fixture.competitionId], configId: 'default', existingPredictionPolicy: 'NEW_VERSION', status: 'RUNNING', totalFixtures: 1, startedAt: now, items: { create: { fixtureId } } }, include: { items: true } });
    await enqueue('predictions.generate-match', { itemId: batch.items[0]!.id }, `batch-item-${batch.items[0]!.id}`);
    return reply.code(202).send({ batchId: batch.id });
  });
}
