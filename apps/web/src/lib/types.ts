export type Outcome = 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';

export type Probabilities = Record<Outcome, number>;

export interface Competition {
  id: string;
  name: string;
  emblem?: string | null;
  enabled: boolean;
  available: boolean;
}

export interface Fixture {
  id: string;
  kickoff: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  competition: { id: string; name: string; emblem?: string | null };
  season: number | null;
  homeTeam: { id: string; name: string; crest?: string | null };
  awayTeam: { id: string; name: string; crest?: string | null };
  latestPrediction: Prediction | null;
}

export interface Prediction {
  id: string;
  fixtureId: string;
  fixture?: Fixture;
  status: string;
  mode: string;
  predictedOutcome: Outcome | null;
  probabilities: Probabilities | null;
  modelIdentifier: string;
  modelVersion: string;
  modelConfidence: number | null;
  predictedAt: string;
  cutoff: string;
  latencyMs: number | null;
  error?: string | null;
  evaluation?: {
    actualOutcome: Outcome;
    correct: boolean;
    brierScore: number;
    logLoss: number;
  } | null;
  snapshot?: unknown;
}

export interface Batch {
  id: string;
  periodHours: number;
  windowStart: string;
  windowEnd: string;
  competitions: string[];
  existingPredictionPolicy: string;
  status: string;
  totalFixtures: number;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  completedResults?: number;
  accuracy?: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  config?: { model: string; featureSetVersion: string };
}

export interface Backtest {
  id: string;
  competitions: string[];
  seasons: number[];
  cutoffHours: number;
  minHistoricalMatches: number;
  status: string;
  totalFixtures: number;
  completedCount: number;
  failedCount: number;
  excludedCount: number;
  limitation: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
