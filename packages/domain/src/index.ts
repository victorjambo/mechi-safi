import { z } from 'zod';

export const OUTCOMES = ['HOME_WIN', 'DRAW', 'AWAY_WIN'] as const;
export type MatchOutcome = (typeof OUTCOMES)[number];
export const outcomeSchema = z.enum(OUTCOMES);
export const probabilitiesSchema = z.object({
  HOME_WIN: z.number().finite().min(0).max(1),
  DRAW: z.number().finite().min(0).max(1),
  AWAY_WIN: z.number().finite().min(0).max(1),
}).superRefine((value, ctx) => {
  const sum = value.HOME_WIN + value.DRAW + value.AWAY_WIN;
  if (Math.abs(sum - 1) > 0.001) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Probabilities sum to ${sum}, expected 1` });
});
export type Probabilities = z.infer<typeof probabilitiesSchema>;

export const batchRequestSchema = z.object({
  periodHours: z.number().int().min(1).max(168),
  competitions: z.array(z.string().min(2)).min(1).max(20),
  existingPredictionPolicy: z.enum(['SKIP', 'NEW_VERSION']).default('SKIP'),
  predictionConfigId: z.string().default('default'),
});
export const backtestRequestSchema = z.object({
  competitions: z.array(z.string()).min(1),
  seasons: z.array(z.number().int().min(2000).max(2100)).min(1),
  predictionConfigId: z.string().default('default'),
  cutoffHours: z.number().int().min(1).max(168).default(24),
  minHistoricalMatches: z.number().int().min(0).max(50).default(5),
});

export interface NormalizedCompetition { id: string; externalId?: number; name: string; emblem?: string | null; seasons: { year: number; externalId?: number; startDate?: Date; endDate?: Date }[] }
export interface NormalizedFixture {
  provider: string; externalId: string; competitionId: string; seasonYear?: number;
  home: { externalId: string; name: string; shortName?: string; crest?: string | null };
  away: { externalId: string; name: string; shortName?: string; crest?: string | null };
  kickoff: Date; status: string; homeScore: number | null; awayScore: number | null;
  providerUpdatedAt?: Date; raw: unknown;
}
export interface HistoricalFixture {
  id: string; kickoff: Date; homeTeamId: string; awayTeamId: string;
  homeScore: number | null; awayScore: number | null; status: string;
}
export function outcomeFromScore(home: number | null, away: number | null, status: string): MatchOutcome | null {
  if (status !== 'FINISHED' || home === null || away === null) return null;
  return home > away ? 'HOME_WIN' : home < away ? 'AWAY_WIN' : 'DRAW';
}
export function assertPreMatch(cutoff: Date, kickoff: Date): void {
  if (cutoff.getTime() >= kickoff.getTime()) throw new Error('Prediction cutoff must precede kickoff');
}
export function batchProgress(total: number, generated: number, skipped: number, failed: number): number {
  return total === 0 ? 0 : Math.min(100, Math.round(((generated + skipped + failed) / total) * 100));
}
