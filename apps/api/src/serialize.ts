import type { Prisma } from '@mechi/database';

export const fixtureInclude = {
  competition: true,
  homeTeam: true,
  awayTeam: true,
  season: true,
  predictions: {
    where: { status: 'SUCCEEDED' },
    orderBy: { predictedAt: 'desc' },
    take: 1,
    include: { evaluation: true },
  },
} satisfies Prisma.FixtureInclude;
export function fixtureView(fixture: any): any {
  return {
    id: fixture.id,
    kickoff: fixture.kickoff,
    status: fixture.status,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
    competition: {
      id: fixture.competition.id,
      name: fixture.competition.name,
      emblem: fixture.competition.emblem,
    },
    season: fixture.season?.year ?? null,
    homeTeam: {
      id: fixture.homeTeam.id,
      name: fixture.homeTeam.name,
      crest: fixture.homeTeam.crest,
    },
    awayTeam: {
      id: fixture.awayTeam.id,
      name: fixture.awayTeam.name,
      crest: fixture.awayTeam.crest,
    },
    latestPrediction: fixture.predictions?.[0] ? predictionView(fixture.predictions[0]) : null,
  };
}
export function predictionView(prediction: any): any {
  return {
    id: prediction.id,
    fixtureId: prediction.fixtureId,
    status: prediction.status,
    mode: prediction.mode,
    predictedOutcome: prediction.predictedOutcome,
    probabilities:
      prediction.homeProbability === null
        ? null
        : {
            HOME_WIN: prediction.homeProbability,
            DRAW: prediction.drawProbability,
            AWAY_WIN: prediction.awayProbability,
          },
    modelIdentifier: prediction.modelIdentifier,
    modelVersion: prediction.modelVersion,
    modelConfidence: prediction.modelConfidence,
    predictedAt: prediction.predictedAt,
    cutoff: prediction.cutoff,
    latencyMs: prediction.latencyMs,
    error: prediction.error,
    evaluation: prediction.evaluation ?? null,
    fixture: prediction.fixture
      ? fixtureView({ ...prediction.fixture, predictions: [] })
      : undefined,
    snapshot: prediction.snapshot?.data,
    providerRequestId: prediction.providerRequestId,
  };
}
export function pageQuery(query: unknown) {
  const parsed = (query ?? {}) as Record<string, unknown>;
  const page = Math.max(1, Math.min(10000, Number(parsed.page) || 1));
  const limit = Math.max(1, Math.min(100, Number(parsed.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}
