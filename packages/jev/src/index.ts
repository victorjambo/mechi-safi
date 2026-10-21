import { z } from 'zod';
import { probabilitiesSchema, type MatchOutcome, type Probabilities } from '@mechi/domain';
import type { MatchFeatures } from '@mechi/features';

export interface JevInput { competition: string; kickoff: string; homeTeam: string; awayTeam: string; features: MatchFeatures }
export interface PredictionResult { predictedOutcome: MatchOutcome; probabilities: Probabilities; modelConfidence?: number; modelVersion: string; latencyMs: number; rawResponse: unknown; providerRequestId?: string }
export interface JevProvider { readonly name: string; predict(input: JevInput, model: string): Promise<PredictionResult> }
export const QUESTION_VERSION = 'football-1x2-v1';
export function makeJevRequest(input: JevInput, model: string) {
  return { model, state: JSON.stringify({ ...input, questionVersion: QUESTION_VERSION }), questions: { outcome: {
    type: 'choice', instructions: 'Predict the result after regulation time, including stoppage time, using only the supplied pre-match information. Choose exactly one outcome.',
    criteria: { HOME_WIN: 'The home team wins', DRAW: 'The teams draw', AWAY_WIN: 'The away team wins' } } } };
}
const responseSchema = z.object({ id: z.string().optional(), model: z.string(), model_version: z.string(), latency_ms: z.number().optional(),
  answers: z.object({ outcome: z.object({ type: z.literal('choice'), choice: z.enum(['HOME_WIN', 'DRAW', 'AWAY_WIN']), probabilities: z.object({ HOME_WIN: z.number(), DRAW: z.number(), AWAY_WIN: z.number() }), confidence: z.number().finite().min(0).max(1).optional() }) }) });
export function normalizeJevResponse(raw: unknown, requestedModel: string, measuredLatency: number): PredictionResult {
  const data = responseSchema.parse(raw);
  if (data.model !== requestedModel) throw new Error(`Jev returned model ${data.model}, requested ${requestedModel}`);
  const probabilities = probabilitiesSchema.parse(data.answers.outcome.probabilities);
  if (probabilities[data.answers.outcome.choice] + 0.001 < Math.max(...Object.values(probabilities))) throw new Error('Jev selected outcome is not its highest-probability choice');
  return { predictedOutcome: data.answers.outcome.choice, probabilities, modelConfidence: data.answers.outcome.confidence,
    modelVersion: data.model_version, latencyMs: data.latency_ms ?? measuredLatency, rawResponse: raw, providerRequestId: data.id };
}
export class RealJevProvider implements JevProvider {
  readonly name = 'Jev AI';
  constructor(private baseUrl: string, private apiKey: string) { if (!apiKey) throw new Error('JEV_API_KEY is required in real mode'); }
  async predict(input: JevInput, model: string): Promise<PredictionResult> {
    const start = Date.now();
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/v1/systemone/`, { method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(makeJevRequest(input, model)), signal: AbortSignal.timeout(20000) });
      if (response.ok) return normalizeJevResponse(await response.json(), model, Date.now() - start);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(`Jev HTTP ${response.status}: ${await response.text()}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
    throw new Error('Jev request failed');
  }
}
export class MockJevProvider implements JevProvider {
  readonly name = 'MOCK Jev';
  async predict(input: JevInput, model: string): Promise<PredictionResult> {
    const difference = input.features.home.elo - input.features.away.elo + 65;
    const home = 1 / (1 + Math.exp(-difference / 220));
    const draw = 0.25;
    const probabilities: Probabilities = { HOME_WIN: home * (1 - draw), DRAW: draw, AWAY_WIN: (1 - home) * (1 - draw) };
    const predictedOutcome = (Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0]) as MatchOutcome;
    return { predictedOutcome, probabilities, modelConfidence: probabilities[predictedOutcome], modelVersion: `mock-${model}`,
      latencyMs: 1, rawResponse: { synthetic: true, outcome: predictedOutcome, probabilities } };
  }
}
