import { describe, expect, it } from 'vitest';
import { buildFeatures } from '@mechi/features';
import type { HistoricalFixture } from '@mechi/domain';

const fixture = (
  id: string,
  day: number,
  home: string,
  away: string,
  homeScore: number | null,
  awayScore: number | null,
): HistoricalFixture => ({
  id,
  kickoff: new Date(Date.UTC(2024, 7, day, 15)),
  homeTeamId: home,
  awayTeamId: away,
  homeScore,
  awayScore,
  status: homeScore === null ? 'SCHEDULED' : 'FINISHED',
});
describe('point-in-time features', () => {
  it('uses only finalized earlier matches and excludes the target', () => {
    const target = fixture('target', 20, 'a', 'b', 9, 0);
    const earlier = fixture('earlier', 10, 'a', 'c', 2, 0);
    const later = fixture('later', 22, 'b', 'a', 0, 8);
    const result = buildFeatures(
      target,
      [target, earlier, later],
      new Date(Date.UTC(2024, 7, 19, 15)),
    );
    expect(result.home.played).toBe(1);
    expect(result.home.goalsFor).toBe(2);
    expect(result.away.played).toBe(0);
    expect(result.historicalMatchCount).toBe(1);
  });
  it('rejects a cutoff at kickoff', () => {
    const target = fixture('target', 20, 'a', 'b', null, null);
    expect(() => buildFeatures(target, [], target.kickoff)).toThrow();
  });
});
