import { Worker, type Job } from 'bullmq';
import { config, assertProductionConfig } from '@mechi/config';
import { db } from '@mechi/database';
import { FootballDataOrgProvider, MockFootballProvider } from '@mechi/football-data';
import { RealJevProvider, MockJevProvider } from '@mechi/jev';
import { connection, queue, enqueue, type JobName } from '@mechi/jobs';
import { syncCompetitions, syncFixtures, processBatchItem, processBacktestFixture, evaluateFixture } from '@mechi/prediction';

assertProductionConfig();
const football = config.MOCK_MODE ? new MockFootballProvider() : new FootballDataOrgProvider(config.FOOTBALL_DATA_BASE_URL, config.FOOTBALL_DATA_API_KEY);
const jev = config.MOCK_MODE ? new MockJevProvider() : new RealJevProvider(config.JEV_BASE_URL, config.JEV_API_KEY);

async function record(job: Job, status: string, error?: string) {
  await db.jobExecution.upsert({ where: { id: job.id! }, create: { id: job.id!, name: job.name, status, attempts: job.attemptsMade + 1, error, startedAt: status === 'RUNNING' ? new Date() : undefined, completedAt: ['COMPLETED', 'FAILED'].includes(status) ? new Date() : undefined },
    update: { status, attempts: job.attemptsMade + 1, error, ...(status === 'RUNNING' ? { startedAt: new Date() } : {}), ...(['COMPLETED', 'FAILED'].includes(status) ? { completedAt: new Date() } : {}) } });
}

let syncTail: Promise<unknown> = Promise.resolve();
async function performSyncWindow(from: Date, to: Date, competitions?: string[]) {
  try {
  const available = await football.competitions();
  await syncCompetitions(available);
  if (!config.MOCK_MODE) await db.competition.updateMany({ where: { id: { notIn: available.map((item) => item.id) } }, data: { available: false } });
  const enabled = await db.competition.findMany({ where: { enabled: true, available: true } });
  const codes = enabled.map((c) => c.id).filter((code) => !competitions || competitions.includes(code));
  const matches = await football.matches({ competitions: codes, from, to });
  const result = await syncFixtures(matches);
  await db.providerSyncState.upsert({ where: { id: 'football' }, create: { id: 'football', lastSuccessAt: new Date() }, update: { lastSuccessAt: new Date(), lastError: null } });
  return result;
  } catch (error) {
    await db.providerSyncState.upsert({ where: { id: 'football' }, create: { id: 'football', lastError: error instanceof Error ? error.message : String(error) }, update: { lastError: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
}
function syncWindow(from: Date, to: Date, competitions?: string[]) {
  const task = syncTail.then(() => performSyncWindow(from, to, competitions));
  syncTail = task.catch(() => undefined);
  return task;
}

async function runJob(job: Job) {
  const name = job.name as JobName;
  switch (name) {
    case 'fixtures.sync': return syncWindow(new Date(Date.now() - 90 * 86400000), new Date(Date.now() + 8 * 86400000));
    case 'fixtures.sync-results': {
      const result = await syncWindow(new Date(Date.now() - 7 * 86400000), new Date());
      const completed = await db.fixture.findMany({ where: { status: 'FINISHED', kickoff: { gte: new Date(Date.now() - 7 * 86400000) } }, select: { id: true } });
      for (const fixture of completed) await enqueue('predictions.evaluate', { fixtureId: fixture.id }, `evaluate-${fixture.id}-${Date.now()}`);
      return result;
    }
    case 'predictions.generate-batch': {
      const batchId = String(job.data.batchId);
      const batch = await db.predictionBatch.findUniqueOrThrow({ where: { id: batchId } });
      if (batch.status === 'CANCELLED') return;
      await db.predictionBatch.update({ where: { id: batchId }, data: { status: 'RUNNING', startedAt: new Date() } });
      await syncWindow(new Date(batch.windowStart.getTime() - 90 * 86400000), batch.windowEnd, batch.competitions);
      const fixtures = await db.fixture.findMany({ where: { kickoff: { gte: batch.windowStart, lte: batch.windowEnd }, competitionId: { in: batch.competitions }, status: 'SCHEDULED' }, orderBy: { kickoff: 'asc' } });
      for (const fixture of fixtures) {
        const item = await db.predictionBatchItem.upsert({ where: { batchId_fixtureId: { batchId, fixtureId: fixture.id } }, create: { batchId, fixtureId: fixture.id }, update: {} });
        await enqueue('predictions.generate-match', { itemId: item.id }, `batch-item-${item.id}`);
      }
      if (!fixtures.length) await db.predictionBatch.update({ where: { id: batchId }, data: { status: 'COMPLETED', totalFixtures: 0, completedAt: new Date() } });
      else await db.predictionBatch.update({ where: { id: batchId }, data: { totalFixtures: fixtures.length } });
      return { fixtures: fixtures.length };
    }
    case 'predictions.generate-match': return processBatchItem(String(job.data.itemId), jev);
    case 'predictions.evaluate': return evaluateFixture(String(job.data.fixtureId));
    case 'predictions.schedule': {
      const settings = await db.applicationSettings.findUnique({ where: { id: 'default' } });
      if (!settings?.automaticPredictions) return;
      const from = new Date(Date.now() + (settings.automaticCutoffHours - 0.5) * 3600000);
      const to = new Date(Date.now() + (settings.automaticCutoffHours + 0.5) * 3600000);
      const fixtures = await db.fixture.findMany({ where: { status: 'SCHEDULED', kickoff: { gte: from, lte: to }, competition: { enabled: true } } });
      for (const fixture of fixtures) {
        const existing = await db.prediction.findFirst({ where: { fixtureId: fixture.id, mode: 'FORWARD', triggerSource: 'SCHEDULED', status: 'SUCCEEDED' } });
        if (existing) continue;
        const batch = await db.predictionBatch.create({ data: { periodHours: 1, windowStart: new Date(), windowEnd: to, competitions: [fixture.competitionId], configId: 'default', existingPredictionPolicy: 'SKIP', triggerSource: 'SCHEDULED', status: 'RUNNING', totalFixtures: 1, startedAt: new Date(), items: { create: { fixtureId: fixture.id } } }, include: { items: true } });
        await enqueue('predictions.generate-match', { itemId: batch.items[0]!.id }, `batch-item-${batch.items[0]!.id}`);
      }
      return { fixtures: fixtures.length };
    }
    case 'backtests.execute': {
      const runId = String(job.data.runId);
      const run = await db.backtestRun.findUniqueOrThrow({ where: { id: runId } });
      if (run.status === 'CANCELLED') return;
      await db.backtestRun.update({ where: { id: runId }, data: { status: 'RUNNING', startedAt: new Date(), limitation: 'Historical scores are reconstructed from current provider records. Result publication times are unavailable, so point-in-time source verification is limited.' } });
      const available = await football.competitions(); await syncCompetitions(available);
      for (const season of run.seasons) {
        const fixtures = await football.matches({ competitions: run.competitions, season });
        await syncFixtures(fixtures);
      }
      const fixtures = await db.fixture.findMany({ where: { competitionId: { in: run.competitions }, season: { year: { in: run.seasons } }, status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } }, orderBy: { kickoff: 'asc' } });
      for (const fixture of fixtures) {
        const item = await db.backtestRunFixture.upsert({ where: { runId_fixtureId: { runId, fixtureId: fixture.id } }, create: { runId, fixtureId: fixture.id }, update: {} });
        await enqueue('backtests.process-match', { runFixtureId: item.id }, `backtest-item-${item.id}`);
      }
      await db.backtestRun.update({ where: { id: runId }, data: { totalFixtures: fixtures.length, ...(!fixtures.length ? { status: 'COMPLETED', completedAt: new Date() } : {}) } });
      return { fixtures: fixtures.length };
    }
    case 'backtests.process-match': return processBacktestFixture(String(job.data.runFixtureId), jev);
    case 'analytics.refresh': {
      const fixtures = await db.fixture.findMany({ where: { status: 'FINISHED', predictions: { some: { status: 'SUCCEEDED' } } }, select: { id: true } });
      let evaluated = 0;
      for (const fixture of fixtures) evaluated += await evaluateFixture(fixture.id);
      await db.providerSyncState.upsert({ where: { id: 'analytics' }, create: { id: 'analytics', lastSuccessAt: new Date() }, update: { lastSuccessAt: new Date(), lastError: null } });
      return { evaluated };
    }
    default: throw new Error(`Unknown job ${job.name}`);
  }
}

const worker = new Worker('mechi', async (job) => {
  await record(job, 'RUNNING');
  try { const result = await runJob(job); await record(job, 'COMPLETED'); return result; }
  catch (error) {
    await record(job, 'FAILED', error instanceof Error ? error.message : String(error));
    if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
      if (job.name === 'predictions.generate-batch') await db.predictionBatch.update({ where: { id: String(job.data.batchId) }, data: { status: 'FAILED', completedAt: new Date() } });
      if (job.name === 'backtests.execute') await db.backtestRun.update({ where: { id: String(job.data.runId) }, data: { status: 'FAILED', completedAt: new Date() } });
    }
    throw error;
  }
}, { connection, concurrency: 3, limiter: { max: config.MOCK_MODE ? 1000 : 30, duration: 60000 } });

worker.on('failed', (job, error) => console.error(`Job ${job?.name} failed: ${error.message}`));
await queue.upsertJobScheduler('fixture-discovery', { every: 6 * 3600000 }, { name: 'fixtures.sync', data: {} });
await queue.upsertJobScheduler('result-sync', { every: 30 * 60000 }, { name: 'fixtures.sync-results', data: {} });
await queue.upsertJobScheduler('scheduled-predictions', { every: 30 * 60000 }, { name: 'predictions.schedule', data: {} });
await queue.upsertJobScheduler('analytics-reconciliation', { every: 60 * 60000 }, { name: 'analytics.refresh', data: {} });
await enqueue('fixtures.sync', {}, `startup-sync-${Math.floor(Date.now() / 3600000)}`);
console.log(`Mechi Safi worker ready (${config.MOCK_MODE ? 'MOCK' : 'REAL'} mode)`);
async function shutdown() { await worker.close(); await queue.close(); await connection.quit(); await db.$disconnect(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
