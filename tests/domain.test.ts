import { describe, expect, it } from 'vitest';
import { batchProgress, outcomeFromScore, probabilitiesSchema } from '@mechi/domain';
import { scorePrediction } from '@mechi/evaluation';

describe('1X2 domain and evaluation', () => {
  it('scores only finalized regulation results', () => {
    expect(outcomeFromScore(2, 1, 'FINISHED')).toBe('HOME_WIN');
    expect(outcomeFromScore(1, 1, 'FINISHED')).toBe('DRAW');
    expect(outcomeFromScore(0, 3, 'FINISHED')).toBe('AWAY_WIN');
    expect(outcomeFromScore(2, 1, 'POSTPONED')).toBeNull();
  });
  it('rejects missing or invalid probability distributions', () => {
    expect(() => probabilitiesSchema.parse({ HOME_WIN: 0.4, DRAW: 0.3 })).toThrow();
    expect(() => probabilitiesSchema.parse({ HOME_WIN: 0.4, DRAW: 0.3, AWAY_WIN: 0.4 })).toThrow();
    expect(() => probabilitiesSchema.parse({ HOME_WIN: NaN, DRAW: 0.3, AWAY_WIN: 0.7 })).toThrow();
  });
  it('computes Brier score and log loss for the actual class', () => {
    const result = scorePrediction({ HOME_WIN: 0.7, DRAW: 0.2, AWAY_WIN: 0.1 }, 'HOME_WIN', 'HOME_WIN');
    expect(result.correct).toBe(true);
    expect(result.brierScore).toBeCloseTo(0.14);
    expect(result.logLoss).toBeCloseTo(-Math.log(0.7));
  });
  it('reports batch progress using terminal item counts', () => {
    expect(batchProgress(10, 4, 2, 1)).toBe(70);
    expect(batchProgress(0, 0, 0, 0)).toBe(0);
  });
});
