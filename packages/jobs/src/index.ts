import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
export const queue = new Queue('mechi', { connection });
export const jobNames = ['fixtures.sync', 'fixtures.sync-results', 'predictions.generate-batch', 'predictions.generate-match', 'predictions.evaluate', 'predictions.schedule', 'backtests.execute', 'backtests.process-match', 'analytics.refresh'] as const;
export type JobName = (typeof jobNames)[number];
const defaults: JobsOptions = { attempts: 4, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 };
export async function enqueue(name: JobName, data: Record<string, unknown>, jobId?: string) {
  return queue.add(name, data, { ...defaults, jobId });
}
