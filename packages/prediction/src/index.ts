import { createHash, randomUUID } from 'node:crypto';
import { db, type Fixture, type Prisma } from '@mechi/database';
import {
  assertPreMatch,
  outcomeFromScore,
  type HistoricalFixture,
  type NormalizedCompetition,
  type NormalizedFixture,
} from '@mechi/domain';
import { buildFeatures, baselines } from '@mechi/features';
import { makeJevRequest, type JevProvider } from '@mechi/jev';
import { scorePrediction } from '@mechi/evaluation';

export async function syncCompetitions(competitions: NormalizedCompetition[]) {
  for (const competition of competitions) {
    await db.competition.upsert({
      where: { id: competition.id },
      create: {
        id: competition.id,
        externalId: competition.externalId,
        name: competition.name,
        emblem: competition.emblem,
        available: true,
      },
      update: {
        externalId: competition.externalId,
        name: competition.name,
        emblem: competition.emblem,
        available: true,
      },
    });
    await db.season.updateMany({
      where: { competitionId: competition.id },
      data: { available: false },
    });
    for (const season of competition.seasons)
      await db.season.upsert({
        where: { competitionId_year: { competitionId: competition.id, year: season.year } },
        create: {
          competitionId: competition.id,
          year: season.year,
          externalId: season.externalId,
          startDate: season.startDate,
          endDate: season.endDate,
        },
        update: {
          available: true,
          externalId: season.externalId,
          startDate: season.startDate,
          endDate: season.endDate,
        },
      });
  }
}

async function upsertTeam(team: NormalizedFixture['home'], provider: string) {
  const existing = await db.teamExternalId.findUnique({
    where: { provider_externalId: { provider, externalId: team.externalId } },
  });
  if (existing) {
    await db.team.update({
      where: { id: existing.teamId },
      data: { name: team.name, shortName: team.shortName, crest: team.crest },
    });
    return existing.teamId;
  }
  try {
    const created = await db.team.create({
      data: {
        name: team.name,
        shortName: team.shortName,
        crest: team.crest,
        externalIds: { create: { provider, externalId: team.externalId } },
      },
    });
    return created.id;
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const concurrent = await db.teamExternalId.findUniqueOrThrow({
      where: { provider_externalId: { provider, externalId: team.externalId } },
    });
    return concurrent.teamId;
  }
}

export async function syncFixtures(fixtures: NormalizedFixture[]) {
  let updated = 0;
  for (const match of fixtures) {
    const homeTeamId = await upsertTeam(match.home, match.provider);
    const awayTeamId = await upsertTeam(match.away, match.provider);
    const season = match.seasonYear
      ? await db.season.upsert({
          where: {
            competitionId_year: { competitionId: match.competitionId, year: match.seasonYear },
          },
          create: { competitionId: match.competitionId, year: match.seasonYear },
          update: {},
        })
      : null;
    const existing = await db.fixture.findUnique({
      where: { provider_externalId: { provider: match.provider, externalId: match.externalId } },
    });
    const changed =
      !existing ||
      existing.kickoff.getTime() !== match.kickoff.getTime() ||
      existing.status !== match.status ||
      existing.homeScore !== match.homeScore ||
      existing.awayScore !== match.awayScore;
    const fixture = await db.fixture.upsert({
      where: { provider_externalId: { provider: match.provider, externalId: match.externalId } },
      create: {
        provider: match.provider,
        externalId: match.externalId,
        competitionId: match.competitionId,
        seasonId: season?.id,
        homeTeamId,
        awayTeamId,
        kickoff: match.kickoff,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        lastProviderUpdate: match.providerUpdatedAt,
        resultVersion: changed ? 1 : 0,
      },
      update: {
        competitionId: match.competitionId,
        seasonId: season?.id,
        homeTeamId,
        awayTeamId,
        kickoff: match.kickoff,
        status: match.status,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        lastProviderUpdate: match.providerUpdatedAt,
        ...(changed ? { resultVersion: { increment: 1 } } : {}),
      },
    });
    if (changed) {
      updated++;
      await db.fixtureRevision.create({
        data: {
          fixtureId: fixture.id,
          kickoff: match.kickoff,
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          providerPayload: match.raw as Prisma.InputJsonValue,
        },
      });
    }
  }
  return { received: fixtures.length, updated };
}

function asHistory(fixture: Fixture): HistoricalFixture {
  return {
    id: fixture.id,
    kickoff: fixture.kickoff,
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    status: fixture.status,
  };
}

export async function createPrediction(
  fixtureId: string,
  configId: string,
  mode: 'FORWARD' | 'BACKTEST',
  cutoff: Date,
  jev: JevProvider,
  triggerSource: 'MANUAL' | 'SCHEDULED' = 'MANUAL',
  runKey?: string,
) {
  const fixture = await db.fixture.findUniqueOrThrow({
    where: { id: fixtureId },
    include: { homeTeam: true, awayTeam: true, competition: true },
  });
  assertPreMatch(cutoff, fixture.kickoff);
  const config = await db.predictionConfig.findUniqueOrThrow({ where: { id: configId } });
  const history = await db.fixture.findMany({
    where: { competitionId: fixture.competitionId, kickoff: { lt: cutoff }, status: 'FINISHED' },
    orderBy: { kickoff: 'asc' },
  });
  const features = buildFeatures(asHistory(fixture), history.map(asHistory), cutoff);
  const input = {
    competition: fixture.competition.name,
    kickoff: fixture.kickoff.toISOString(),
    homeTeam: fixture.homeTeam.name,
    awayTeam: fixture.awayTeam.name,
    features,
  };
  const request = makeJevRequest(input, config.model);
  const idempotencyKey = createHash('sha256')
    .update(`${mode}:${fixtureId}:${configId}:${cutoff.toISOString()}:${runKey ?? ''}`)
    .digest('hex');
  const existing = await db.prediction.findUnique({ where: { idempotencyKey } });
  if (existing?.status === 'SUCCEEDED') return existing;
  const snapshot = existing
    ? null
    : await db.featureSnapshot.create({
        data: {
          fixtureId,
          cutoff,
          featureSetVersion: config.featureSetVersion,
          provenance: 'RECONSTRUCTED',
          data: features as unknown as Prisma.InputJsonValue,
        },
      });
  const prediction = existing
    ? await db.prediction.update({
        where: { id: existing.id },
        data: { status: 'PENDING', error: null },
      })
    : await db.prediction.create({
        data: {
          fixtureId,
          configId,
          snapshotId: snapshot!.id,
          mode,
          triggerSource,
          modelIdentifier: config.model,
          modelVersion: config.model,
          cutoff,
          idempotencyKey,
          rawRequest: request as Prisma.InputJsonValue,
        },
      });
  try {
    const result = await jev.predict(input, config.model);
    const updated = await db.prediction.update({
      where: { id: prediction.id },
      data: {
        status: 'SUCCEEDED',
        predictedOutcome: result.predictedOutcome,
        homeProbability: result.probabilities.HOME_WIN,
        drawProbability: result.probabilities.DRAW,
        awayProbability: result.probabilities.AWAY_WIN,
        modelConfidence: result.modelConfidence,
        modelVersion: result.modelVersion,
        providerRequestId: result.providerRequestId,
        latencyMs: result.latencyMs,
        rawResponse: result.rawResponse as Prisma.InputJsonValue,
      },
    });
    if (mode === 'BACKTEST' || fixture.status === 'FINISHED') await evaluateFixture(fixtureId);
    return updated;
  } catch (error) {
    await db.prediction.update({
      where: { id: prediction.id },
      data: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function evaluateFixture(fixtureId: string) {
  const fixture = await db.fixture.findUniqueOrThrow({
    where: { id: fixtureId },
    include: { predictions: { where: { status: 'SUCCEEDED' } } },
  });
  const actual = outcomeFromScore(fixture.homeScore, fixture.awayScore, fixture.status);
  if (!actual) return 0;
  let evaluated = 0;
  for (const prediction of fixture.predictions) {
    if (
      !prediction.predictedOutcome ||
      prediction.homeProbability === null ||
      prediction.drawProbability === null ||
      prediction.awayProbability === null
    )
      continue;
    if (prediction.mode === 'FORWARD' && prediction.predictedAt >= fixture.kickoff) continue;
    const scores = scorePrediction(
      {
        HOME_WIN: prediction.homeProbability,
        DRAW: prediction.drawProbability,
        AWAY_WIN: prediction.awayProbability,
      },
      prediction.predictedOutcome,
      actual,
    );
    await db.predictionEvaluation.upsert({
      where: { predictionId: prediction.id },
      create: {
        predictionId: prediction.id,
        resultVersion: fixture.resultVersion,
        actualOutcome: actual,
        ...scores,
      },
      update: { resultVersion: fixture.resultVersion, actualOutcome: actual, ...scores },
    });
    evaluated++;
  }
  return evaluated;
}

export async function refreshBatch(batchId: string) {
  const counts = await db.predictionBatchItem.groupBy({
    by: ['status'],
    where: { batchId },
    _count: true,
  });
  const count = (status: string) => counts.find((row) => row.status === status)?._count ?? 0;
  const generatedCount = count('GENERATED'),
    skippedCount = count('SKIPPED') + count('EXCLUDED'),
    failedCount = count('FAILED');
  const pending = count('QUEUED') + count('RUNNING');
  const batch = await db.predictionBatch.findUniqueOrThrow({ where: { id: batchId } });
  const status =
    batch.status === 'CANCELLED'
      ? 'CANCELLED'
      : pending
        ? 'RUNNING'
        : failedCount
          ? generatedCount || skippedCount
            ? 'COMPLETED_WITH_ERRORS'
            : 'FAILED'
          : 'COMPLETED';
  return db.predictionBatch.update({
    where: { id: batchId },
    data: {
      generatedCount,
      skippedCount,
      failedCount,
      totalFixtures: counts.reduce((sum, row) => sum + row._count, 0),
      status,
      ...(!pending ? { completedAt: new Date() } : {}),
    },
  });
}

export async function processBatchItem(itemId: string, jev: JevProvider) {
  const item = await db.predictionBatchItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { batch: true, fixture: true },
  });
  if (
    item.batch.status === 'CANCELLED' ||
    ['GENERATED', 'SKIPPED', 'EXCLUDED'].includes(item.status)
  )
    return;
  if (item.fixture.kickoff <= new Date() || item.fixture.status !== 'SCHEDULED') {
    await db.predictionBatchItem.update({
      where: { id: itemId },
      data: { status: 'EXCLUDED', reason: 'Fixture started or is no longer scheduled' },
    });
    await refreshBatch(item.batchId);
    return;
  }
  if (item.batch.existingPredictionPolicy === 'SKIP') {
    const existing = await db.prediction.findFirst({
      where: {
        fixtureId: item.fixtureId,
        configId: item.batch.configId,
        mode: 'FORWARD',
        status: 'SUCCEEDED',
        predictedAt: { lt: item.fixture.kickoff },
      },
      orderBy: { predictedAt: 'desc' },
    });
    if (existing) {
      await db.predictionBatchItem.update({
        where: { id: itemId },
        data: { status: 'SKIPPED', predictionId: existing.id },
      });
      await refreshBatch(item.batchId);
      return;
    }
  }
  await db.predictionBatchItem.update({
    where: { id: itemId },
    data: { status: 'RUNNING', attempts: { increment: 1 } },
  });
  try {
    const prediction = await createPrediction(
      item.fixtureId,
      item.batch.configId,
      'FORWARD',
      item.batch.windowStart,
      jev,
      item.batch.triggerSource,
      item.batch.existingPredictionPolicy === 'NEW_VERSION' ? item.batchId : undefined,
    );
    await db.predictionBatchItem.update({
      where: { id: itemId },
      data: { status: 'GENERATED', predictionId: prediction.id, reason: null },
    });
  } catch (error) {
    await db.predictionBatchItem.update({
      where: { id: itemId },
      data: { status: 'FAILED', reason: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  } finally {
    await refreshBatch(item.batchId);
  }
}

export async function refreshBacktest(runId: string) {
  const counts = await db.backtestRunFixture.groupBy({
    by: ['status'],
    where: { runId },
    _count: true,
  });
  const count = (status: string) => counts.find((entry) => entry.status === status)?._count ?? 0;
  const remaining = count('QUEUED') + count('RUNNING');
  const run = await db.backtestRun.findUniqueOrThrow({ where: { id: runId } });
  const runStatus =
    run.status === 'CANCELLED'
      ? 'CANCELLED'
      : remaining
        ? 'RUNNING'
        : count('FAILED')
          ? 'COMPLETED_WITH_ERRORS'
          : 'COMPLETED';
  return db.backtestRun.update({
    where: { id: runId },
    data: {
      completedCount: count('GENERATED'),
      failedCount: count('FAILED'),
      excludedCount: count('EXCLUDED'),
      status: runStatus,
      ...(!remaining ? { completedAt: new Date() } : {}),
    },
  });
}

export async function processBacktestFixture(runFixtureId: string, jev: JevProvider) {
  const row = await db.backtestRunFixture.findUniqueOrThrow({
    where: { id: runFixtureId },
    include: { fixture: true, run: true },
  });
  if (row.run.status === 'CANCELLED' || row.status === 'GENERATED') return;
  const cutoff = new Date(row.fixture.kickoff.getTime() - row.run.cutoffHours * 3600000);
  const historyCount = await db.fixture.count({
    where: {
      competitionId: row.fixture.competitionId,
      kickoff: { lt: new Date(cutoff.getTime() - 3 * 3600000) },
      status: 'FINISHED',
    },
  });
  await db.backtestRunFixture.update({ where: { id: row.id }, data: { status: 'RUNNING' } });
  try {
    if (historyCount < row.run.minHistoricalMatches) {
      await db.backtestRunFixture.update({
        where: { id: row.id },
        data: { status: 'EXCLUDED', reason: `Only ${historyCount} earlier matches` },
      });
    } else {
      try {
        const prediction = await createPrediction(
          row.fixtureId,
          row.run.configId,
          'BACKTEST',
          cutoff,
          jev,
          'MANUAL',
          row.runId,
        );
        await db.backtestRunFixture.update({
          where: { id: row.id },
          data: { status: 'GENERATED', predictionId: prediction.id },
        });
      } catch (error) {
        await db.backtestRunFixture.update({
          where: { id: row.id },
          data: {
            status: 'FAILED',
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }
  } finally {
    await refreshBacktest(row.runId);
  }
}

export function newRunKey() {
  return randomUUID();
}
export { baselines };
