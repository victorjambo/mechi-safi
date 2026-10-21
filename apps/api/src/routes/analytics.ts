import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@mechi/database';
import { OUTCOMES, type MatchOutcome, type Probabilities } from '@mechi/domain';
import { calibration, confusionMatrix, scorePrediction, summarize } from '@mechi/evaluation';
import { baselines, type MatchFeatures } from '@mechi/features';

const filterSchema = z.object({ mode: z.enum(['FORWARD', 'BACKTEST']).default('FORWARD'), competition: z.string().optional(), season: z.coerce.number().optional(), modelVersion: z.string().optional(), batchId: z.string().optional(), backtestId: z.string().optional(), from: z.string().optional(), to: z.string().optional() });
async function data(query: unknown) {
  const filter = filterSchema.parse(query);
  const where: any = { mode: filter.mode, status: 'SUCCEEDED', ...(filter.competition ? { fixture: { competitionId: filter.competition } } : {}),
    ...(filter.season ? { fixture: { season: { year: filter.season }, ...(filter.competition ? { competitionId: filter.competition } : {}) } } : {}),
    ...(filter.modelVersion ? { modelVersion: filter.modelVersion } : {}),
    ...(filter.batchId ? { batchItems: { some: { batchId: filter.batchId } } } : {}),
    ...(filter.backtestId ? { backtestFixtures: { some: { runId: filter.backtestId } } } : {}),
    ...((filter.from || filter.to) ? { predictedAt: { ...(filter.from ? { gte: new Date(filter.from) } : {}), ...(filter.to ? { lte: new Date(filter.to) } : {}) } } : {}) };
  const [predictions, fixtureCount] = await Promise.all([
    db.prediction.findMany({ where, include: { evaluation: true, fixture: { include: { competition: true, season: true } }, snapshot: true }, orderBy: { predictedAt: 'asc' } }),
    filter.mode === 'BACKTEST'
      ? db.backtestRunFixture.findMany({ where: { ...(filter.backtestId ? { runId: filter.backtestId } : {}), fixture: { ...(filter.competition ? { competitionId: filter.competition } : {}), ...(filter.season ? { season: { year: filter.season } } : {}) } }, distinct: ['fixtureId'], select: { fixtureId: true } }).then((rows) => rows.length)
      : db.fixture.count({ where: { status: 'FINISHED', ...(filter.competition ? { competitionId: filter.competition } : {}), ...(filter.season ? { season: { year: filter.season } } : {}) } }),
  ]);
  const evaluated = predictions.filter((p) => p.evaluation && p.predictedOutcome && p.homeProbability !== null && p.drawProbability !== null && p.awayProbability !== null).map((p) => ({ id: p.id, fixtureId: p.fixtureId, date: p.fixture.kickoff, competition: p.fixture.competition.name, competitionId: p.fixture.competitionId, season: p.fixture.season?.year ?? null,
    predicted: p.predictedOutcome as MatchOutcome, actual: p.evaluation!.actualOutcome as MatchOutcome, probabilities: { HOME_WIN: p.homeProbability!, DRAW: p.drawProbability!, AWAY_WIN: p.awayProbability! } as Probabilities,
    correct: p.evaluation!.correct, brierScore: p.evaluation!.brierScore, logLoss: p.evaluation!.logLoss, features: p.snapshot.data as unknown as MatchFeatures }));
  return { filter, predictions, evaluated, fixtureCount };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/analytics/overview', { schema: { tags: ['Analytics'], summary: 'Prediction KPIs by mode' } }, async (request) => {
    const { filter, predictions, evaluated, fixtureCount } = await data(request.query);
    return { mode: filter.mode, totalPredictions: predictions.length, evaluatedPredictions: evaluated.length, ...summarize(evaluated), coverage: fixtureCount ? Math.min(1, new Set(evaluated.map((row) => row.fixtureId)).size / fixtureCount) : null, fixtureCount };
  });
  app.get('/analytics/timeline', { schema: { tags: ['Analytics'], summary: 'Weekly accuracy timeline' } }, async (request) => {
    const { evaluated } = await data(request.query);
    const groups = new Map<string, typeof evaluated>();
    for (const row of evaluated) { const date = new Date(row.date); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); const key = date.toISOString().slice(0, 10); groups.set(key, [...(groups.get(key) ?? []), row]); }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([period, rows]) => ({ period, ...summarize(rows) }));
  });
  app.get('/analytics/competitions', { schema: { tags: ['Analytics'], summary: 'Accuracy by competition and season' } }, async (request) => {
    const { evaluated } = await data(request.query);
    const keys = [...new Set(evaluated.map((row) => `${row.competitionId}:${row.season ?? ''}`))];
    return keys.map((key) => { const rows = evaluated.filter((row) => `${row.competitionId}:${row.season ?? ''}` === key); return { competition: rows[0]!.competition, season: rows[0]!.season, ...summarize(rows) }; });
  });
  app.get('/analytics/calibration', { schema: { tags: ['Analytics'], summary: 'Confidence calibration buckets' } }, async (request) => calibration((await data(request.query)).evaluated));
  app.get('/analytics/confusion-matrix', { schema: { tags: ['Analytics'], summary: 'Predicted versus actual 1X2 outcomes' } }, async (request) => {
    const { evaluated } = await data(request.query);
    return { matrix: confusionMatrix(evaluated), distribution: OUTCOMES.map((outcome) => ({ outcome, predicted: evaluated.filter((row) => row.predicted === outcome).length, actual: evaluated.filter((row) => row.actual === outcome).length })), sampleSize: evaluated.length };
  });
  app.get('/analytics/comparison', { schema: { tags: ['Analytics'], summary: 'Jev versus baselines on the same fixtures' } }, async (request) => {
    const { evaluated } = await data(request.query);
    const models = ['jev', 'home_team', 'elo', 'historical_frequency'];
    return models.map((model) => { const scored = evaluated.map((row) => {
      if (model === 'jev') return row;
      const probabilities = baselines(row.features)[model]!;
      const predicted = OUTCOMES.reduce((best, current) => probabilities[current] > probabilities[best] ? current : best, 'HOME_WIN' as MatchOutcome);
      return scorePrediction(probabilities, predicted, row.actual);
    }); return { model, ...summarize(scored) }; });
  });
  app.get('/analytics/model-versions', { schema: { tags: ['Analytics'], summary: 'Observed model versions' } }, async () => db.prediction.findMany({ distinct: ['modelVersion'], select: { modelVersion: true }, orderBy: { modelVersion: 'asc' } }));
}
