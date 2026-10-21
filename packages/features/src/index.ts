import { assertPreMatch, outcomeFromScore, type HistoricalFixture, type Probabilities } from '@mechi/domain';

export const FEATURE_SET_VERSION = 'prematch-v1';
export interface TeamForm { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; recentPoints: number; homePlayed: number; homeWins: number; awayPlayed: number; awayWins: number; daysRest: number | null; elo: number }
export interface MatchFeatures { fixtureId: string; cutoff: string; featureSetVersion: string; provenance: 'RECONSTRUCTED'; home: TeamForm; away: TeamForm; historicalMatchCount: number }

function eloRatings(matches: HistoricalFixture[]): Map<string, number> {
  const ratings = new Map<string, number>();
  for (const match of matches) {
    const actual = outcomeFromScore(match.homeScore, match.awayScore, match.status);
    if (!actual) continue;
    const home = ratings.get(match.homeTeamId) ?? 1500;
    const away = ratings.get(match.awayTeamId) ?? 1500;
    const expected = 1 / (1 + 10 ** ((away - home - 65) / 400));
    const actualHome = actual === 'HOME_WIN' ? 1 : actual === 'DRAW' ? 0.5 : 0;
    const change = 24 * (actualHome - expected);
    ratings.set(match.homeTeamId, home + change);
    ratings.set(match.awayTeamId, away - change);
  }
  return ratings;
}

function teamForm(teamId: string, matches: HistoricalFixture[], cutoff: Date, elo: number): TeamForm {
  const teamMatches = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  const recent = teamMatches.slice(-5);
  let wins = 0, draws = 0, goalsFor = 0, goalsAgainst = 0, recentPoints = 0, homePlayed = 0, homeWins = 0, awayPlayed = 0, awayWins = 0;
  for (const match of teamMatches) {
    const isHome = match.homeTeamId === teamId;
    const gf = isHome ? match.homeScore! : match.awayScore!;
    const ga = isHome ? match.awayScore! : match.homeScore!;
    goalsFor += gf; goalsAgainst += ga;
    if (isHome) homePlayed++; else awayPlayed++;
    if (gf > ga) { wins++; if (isHome) homeWins++; else awayWins++; }
    else if (gf === ga) draws++;
  }
  for (const match of recent) {
    const gf = match.homeTeamId === teamId ? match.homeScore! : match.awayScore!;
    const ga = match.homeTeamId === teamId ? match.awayScore! : match.homeScore!;
    recentPoints += gf > ga ? 3 : gf === ga ? 1 : 0;
  }
  const previous = teamMatches.at(-1);
  return { played: teamMatches.length, wins, draws, losses: teamMatches.length - wins - draws,
    goalsFor, goalsAgainst, recentPoints, homePlayed, homeWins, awayPlayed, awayWins,
    daysRest: previous ? Math.floor((cutoff.getTime() - previous.kickoff.getTime()) / 86400000) : null, elo };
}

export function buildFeatures(target: HistoricalFixture, history: HistoricalFixture[], cutoff: Date): MatchFeatures {
  assertPreMatch(cutoff, target.kickoff);
  const eligible = history.filter((match) => match.id !== target.id && match.kickoff.getTime() + 3 * 3600000 <= cutoff.getTime() && outcomeFromScore(match.homeScore, match.awayScore, match.status) !== null).sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime());
  const elo = eloRatings(eligible);
  return { fixtureId: target.id, cutoff: cutoff.toISOString(), featureSetVersion: FEATURE_SET_VERSION, provenance: 'RECONSTRUCTED',
    home: teamForm(target.homeTeamId, eligible, cutoff, elo.get(target.homeTeamId) ?? 1500),
    away: teamForm(target.awayTeamId, eligible, cutoff, elo.get(target.awayTeamId) ?? 1500), historicalMatchCount: eligible.length };
}

export function baselines(features: MatchFeatures): Record<string, Probabilities> {
  const home = features.home, away = features.away;
  const eloHome = 1 / (1 + 10 ** ((away.elo - home.elo - 65) / 400));
  const frequencyHome = (home.homeWins + 1) / (home.homePlayed + 3);
  const frequencyAway = (away.awayWins + 1) / (away.awayPlayed + 3);
  const total = frequencyHome + frequencyAway + 0.28;
  return { home_team: { HOME_WIN: 0.6, DRAW: 0.25, AWAY_WIN: 0.15 },
    elo: { HOME_WIN: eloHome * 0.75, DRAW: 0.25, AWAY_WIN: (1 - eloHome) * 0.75 },
    historical_frequency: { HOME_WIN: frequencyHome / total, DRAW: 0.28 / total, AWAY_WIN: frequencyAway / total } };
}
