import { OUTCOMES, type MatchOutcome, type Probabilities, probabilitiesSchema } from '@mechi/domain';

export function scorePrediction(probabilities: Probabilities, predicted: MatchOutcome, actual: MatchOutcome) {
  probabilitiesSchema.parse(probabilities);
  return {
    correct: predicted === actual,
    brierScore: OUTCOMES.reduce((sum, outcome) => sum + (probabilities[outcome] - Number(outcome === actual)) ** 2, 0),
    logLoss: -Math.log(Math.max(probabilities[actual], 1e-15)),
  };
}
export function summarize(rows: { correct: boolean; brierScore: number; logLoss: number }[]) {
  const n = rows.length;
  return { sampleSize: n, correct: rows.filter((row) => row.correct).length,
    accuracy: n ? rows.filter((row) => row.correct).length / n : null,
    brierScore: n ? rows.reduce((sum, row) => sum + row.brierScore, 0) / n : null,
    logLoss: n ? rows.reduce((sum, row) => sum + row.logLoss, 0) / n : null };
}
export function confusionMatrix(rows: { predicted: MatchOutcome; actual: MatchOutcome }[]) {
  return OUTCOMES.map((predicted) => ({ predicted,
    ...Object.fromEntries(OUTCOMES.map((actual) => [actual, rows.filter((r) => r.predicted === predicted && r.actual === actual).length])) }));
}
export function calibration(rows: { predicted: MatchOutcome; actual: MatchOutcome; probabilities: Probabilities }[]) {
  return Array.from({ length: 10 }, (_, index) => {
    const start = index / 10;
    const selected = rows.filter((row) => row.probabilities[row.predicted] >= start && (index === 9 || row.probabilities[row.predicted] < start + 0.1));
    return { bucket: `${Math.round(start * 100)}–${Math.round((start + 0.1) * 100)}%`, sampleSize: selected.length,
      predicted: selected.length ? selected.reduce((sum, row) => sum + row.probabilities[row.predicted], 0) / selected.length : null,
      actual: selected.length ? selected.filter((row) => row.predicted === row.actual).length / selected.length : null };
  });
}
