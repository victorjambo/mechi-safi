import { z } from 'zod';
import type { NormalizedCompetition, NormalizedFixture } from '@mechi/domain';

export interface FootballProvider {
  readonly name: string;
  competitions(): Promise<NormalizedCompetition[]>;
  matches(options: { competitions: string[]; from?: Date; to?: Date; season?: number }): Promise<NormalizedFixture[]>;
}

const competitionSchema = z.object({ id: z.number(), code: z.string().nullable().optional(), name: z.string(), emblem: z.string().nullable().optional(), currentSeason: z.object({ id: z.number(), startDate: z.string(), endDate: z.string() }).nullable().optional(), seasons: z.array(z.object({ id: z.number(), startDate: z.string(), endDate: z.string() })).optional() });
const matchSchema = z.object({ id: z.number(), utcDate: z.string(), status: z.string(), lastUpdated: z.string().optional(),
  competition: z.object({ code: z.string().nullable().optional(), id: z.number() }), season: z.object({ startDate: z.string() }).optional(),
  homeTeam: z.object({ id: z.number().nullable(), name: z.string(), shortName: z.string().optional(), crest: z.string().nullable().optional() }),
  awayTeam: z.object({ id: z.number().nullable(), name: z.string(), shortName: z.string().optional(), crest: z.string().nullable().optional() }),
  score: z.object({ fullTime: z.object({ home: z.number().nullable().optional(), away: z.number().nullable().optional(), homeTeam: z.number().nullable().optional(), awayTeam: z.number().nullable().optional() }) }).optional() });

export function normalizeFootballMatch(input: unknown): NormalizedFixture {
  const match = matchSchema.parse(input);
  const homeScore = match.score?.fullTime.home ?? match.score?.fullTime.homeTeam ?? null;
  const awayScore = match.score?.fullTime.away ?? match.score?.fullTime.awayTeam ?? null;
  if (match.homeTeam.id === null || match.awayTeam.id === null) throw new Error(`Match ${match.id} has an unassigned team`);
  return { provider: 'football-data.org', externalId: String(match.id), competitionId: match.competition.code ?? String(match.competition.id),
    seasonYear: match.season ? Number(match.season.startDate.slice(0, 4)) : undefined,
    home: { externalId: String(match.homeTeam.id), name: match.homeTeam.name, shortName: match.homeTeam.shortName, crest: match.homeTeam.crest },
    away: { externalId: String(match.awayTeam.id), name: match.awayTeam.name, shortName: match.awayTeam.shortName, crest: match.awayTeam.crest },
    kickoff: new Date(match.utcDate), status: match.status === 'TIMED' ? 'SCHEDULED' : match.status, homeScore, awayScore,
    providerUpdatedAt: match.lastUpdated ? new Date(match.lastUpdated) : undefined, raw: input };
}

export class FootballDataOrgProvider implements FootballProvider {
  readonly name = 'football-data.org';
  private nextRequestAt = 0;
  private cache = new Map<string, { expires: number; value: unknown }>();
  constructor(private baseUrl: string, private apiKey: string) { if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY is required in real mode'); }
  private async get(path: string, ttlMs = 60000): Promise<unknown> {
    const cached = this.cache.get(path);
    if (cached && cached.expires > Date.now()) return cached.value;
    for (let attempt = 0; attempt < 4; attempt++) {
      const delay = Math.max(0, this.nextRequestAt - Date.now());
      this.nextRequestAt = Date.now() + delay + 6500;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const response = await fetch(`${this.baseUrl}${path}`, { headers: { 'X-Auth-Token': this.apiKey }, signal: AbortSignal.timeout(15000) });
      if (response.ok) { const value: unknown = await response.json(); this.cache.set(path, { expires: Date.now() + ttlMs, value }); return value; }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(`football-data.org HTTP ${response.status}: ${await response.text()}`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(30000, 1000 * 2 ** attempt)));
    }
    throw new Error('Football data request failed');
  }
  async competitions(): Promise<NormalizedCompetition[]> {
    const response = z.object({ competitions: z.array(competitionSchema) }).parse(await this.get('/competitions', 3600000));
    return response.competitions.filter((c) => c.code).map((c) => ({ id: c.code!, externalId: c.id, name: c.name, emblem: c.emblem,
      seasons: (c.seasons ?? (c.currentSeason ? [c.currentSeason] : [])).map((s) => ({ year: Number(s.startDate.slice(0, 4)), externalId: s.id, startDate: new Date(s.startDate), endDate: new Date(s.endDate) })) }));
  }
  async matches(options: { competitions: string[]; from?: Date; to?: Date; season?: number }): Promise<NormalizedFixture[]> {
    const matches: NormalizedFixture[] = [];
    for (const code of options.competitions) {
      const params = new URLSearchParams();
      if (options.season) params.set('season', String(options.season));
      if (options.from) params.set('dateFrom', options.from.toISOString().slice(0, 10));
      if (options.to) params.set('dateTo', options.to.toISOString().slice(0, 10));
      const path = `/competitions/${encodeURIComponent(code)}/matches${params.size ? `?${params}` : ''}`;
      const response = z.object({ matches: z.array(z.unknown()) }).parse(await this.get(path, options.season ? 86400000 : 300000));
      for (const raw of response.matches) {
        try { const match = normalizeFootballMatch(raw); if ((!options.from || match.kickoff >= options.from) && (!options.to || match.kickoff <= options.to)) matches.push(match); }
        catch (error) { if (!(error instanceof Error && error.message.includes('unassigned team'))) throw error; }
      }
    }
    return matches;
  }
}

const mockLeagues = [
  ['PL', 'Premier League', ['Arsenal', 'Liverpool', 'Manchester City', 'Chelsea', 'Newcastle', 'Tottenham']],
  ['PD', 'La Liga', ['Real Madrid', 'Barcelona', 'Atlético Madrid', 'Athletic Club', 'Real Sociedad', 'Villarreal']],
  ['SA', 'Serie A', ['Inter', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Atalanta']],
  ['BL1', 'Bundesliga', ['Bayern Munich', 'Dortmund', 'Leverkusen', 'RB Leipzig', 'Stuttgart', 'Frankfurt']],
  ['FL1', 'Ligue 1', ['Paris Saint-Germain', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice']],
  ['CL', 'UEFA Champions League', ['Real Madrid', 'Bayern Munich', 'Liverpool', 'Inter', 'Barcelona', 'Arsenal']],
] as const;

export class MockFootballProvider implements FootballProvider {
  readonly name = 'MOCK football data';
  async competitions(): Promise<NormalizedCompetition[]> {
    return mockLeagues.map(([id, name], index) => ({ id, name, externalId: 9000 + index, seasons: [2023, 2024, 2025, 2026].map((year) => ({ year })) }));
  }
  async matches(options: { competitions: string[]; from?: Date; to?: Date; season?: number }): Promise<NormalizedFixture[]> {
    const now = new Date(Math.floor(Date.now() / 43200000) * 43200000); const fixtures: NormalizedFixture[] = [];
    for (const [code, , teams] of mockLeagues) {
      if (!options.competitions.includes(code)) continue;
      if (options.season) {
        for (let round = 0; round < 48; round++) {
          const kickoff = new Date(Date.UTC(options.season, 7, 10 + round * 3, 17));
          const homeIndex = (round + Math.floor(round / 6)) % 6;
          const awayIndex = (homeIndex + 1 + (round % 5)) % 6;
          fixtures.push(this.fixture(code, teams, `${code}-${options.season}-${round}`, kickoff, homeIndex, awayIndex, kickoff < now, options.season));
        }
      } else {
        for (let index = -20; index < 15; index++) {
          const kickoff = new Date(now.getTime() + index * 12 * 3600000 + 3 * 3600000);
          fixtures.push(this.fixture(code, teams, `${code}-rolling-${Math.floor(kickoff.getTime() / 43200000)}`, kickoff, ((index % 6) + 6) % 6, (((index + 2) % 6) + 6) % 6, index < 0));
        }
      }
    }
    return fixtures.filter((m) => (!options.from || m.kickoff >= options.from) && (!options.to || m.kickoff <= options.to));
  }
  private fixture(code: string, teams: readonly string[], id: string, kickoff: Date, homeIndex: number, awayIndex: number, finished: boolean, seasonYear = kickoff.getUTCFullYear()): NormalizedFixture {
    const homeScore = finished ? (homeIndex * 3 + awayIndex) % 4 : null;
    const awayScore = finished ? (awayIndex * 2 + homeIndex) % 3 : null;
    return { provider: 'mock', externalId: id, competitionId: code, seasonYear,
      home: { externalId: `${code}-${homeIndex}`, name: teams[homeIndex]! }, away: { externalId: `${code}-${awayIndex}`, name: teams[awayIndex]! },
      kickoff, status: finished ? 'FINISHED' : 'SCHEDULED', homeScore, awayScore,
      raw: { synthetic: true, id, fullTime: { home: homeScore, away: awayScore } } };
  }
}
