import { describe, expect, it } from 'vitest';
import { normalizeFootballMatch, MockFootballProvider } from '@mechi/football-data';
import { makeJevRequest, normalizeJevResponse, MockJevProvider } from '@mechi/jev';
import { buildFeatures } from '@mechi/features';

describe('provider adapters', () => {
  it('normalizes the provider full-time result rather than extra time', () => {
    const match = normalizeFootballMatch({
      id: 1,
      utcDate: '2024-09-01T15:00:00Z',
      status: 'FINISHED',
      competition: { id: 2021, code: 'PL' },
      homeTeam: { id: 1, name: 'Home' },
      awayTeam: { id: 2, name: 'Away' },
      score: { fullTime: { home: 1, away: 1 }, extraTime: { home: 2, away: 1 } },
    });
    expect(match.homeScore).toBe(1);
    expect(match.awayScore).toBe(1);
  });
  it('maps Jev choice probabilities and retains separate confidence', () => {
    const result = normalizeJevResponse(
      {
        id: 'dec_1',
        model: 'jev-1.13',
        model_version: 'jev-1.13-test',
        answers: {
          outcome: {
            type: 'choice',
            choice: 'HOME_WIN',
            probabilities: { HOME_WIN: 0.55, DRAW: 0.25, AWAY_WIN: 0.2 },
            confidence: 0.91,
          },
        },
      },
      'jev-1.13',
      250,
    );
    expect(result.probabilities.HOME_WIN).toBe(0.55);
    expect(result.modelConfidence).toBe(0.91);
    expect(result.providerRequestId).toBe('dec_1');
  });
  it('builds a typed three-choice request and deterministic mock results', async () => {
    const target = {
      id: '1',
      kickoff: new Date('2025-08-20T15:00:00Z'),
      homeTeamId: 'a',
      awayTeamId: 'b',
      homeScore: null,
      awayScore: null,
      status: 'SCHEDULED',
    };
    const features = buildFeatures(target, [], new Date('2025-08-19T15:00:00Z'));
    const input = {
      competition: 'Premier League',
      kickoff: target.kickoff.toISOString(),
      homeTeam: 'A',
      awayTeam: 'B',
      features,
    };
    expect(Object.keys(makeJevRequest(input, 'jev-1.13').questions.outcome.criteria)).toEqual([
      'HOME_WIN',
      'DRAW',
      'AWAY_WIN',
    ]);
    const provider = new MockJevProvider();
    expect(await provider.predict(input, 'jev-1.13')).toEqual(
      await provider.predict(input, 'jev-1.13'),
    );
  });
  it('keeps mock fixture IDs stable within a synchronization window', async () => {
    const provider = new MockFootballProvider();
    const options = { competitions: ['PL'] };
    const a = await provider.matches(options);
    const b = await provider.matches(options);
    expect(a.map((row) => row.externalId)).toEqual(b.map((row) => row.externalId));
  });
});
