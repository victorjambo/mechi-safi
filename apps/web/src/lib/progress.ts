import type { Batch } from './types';

export function batchProgress(batch: Batch) {
  return batch.totalFixtures
    ? Math.round(
        ((batch.generatedCount + batch.skippedCount + batch.failedCount) / batch.totalFixtures) *
          100,
      )
    : batch.status === 'COMPLETED'
      ? 100
      : 0;
}
