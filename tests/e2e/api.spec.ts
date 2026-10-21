import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest, test } from '@playwright/test';

type Batch = {
  id: string;
  status: string;
  generatedCount: number;
  skippedCount: number;
  totalFixtures: number;
};
type BatchItem = { status: string; fixture: { id: string }; prediction: { id: string } | null };

test('batch requests are idempotent and preserve prediction versions', async () => {
  const api = await apiRequest.newContext({
    baseURL: process.env.API_ORIGIN ?? 'http://127.0.0.1:4000',
  });
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { password: process.env.ADMIN_PASSWORD ?? 'change-this-long-private-password' },
    });
    expect(login.ok()).toBeTruthy();
    const body = {
      periodHours: 24,
      competitions: ['PL'],
      predictionConfigId: 'default',
      existingPredictionPolicy: 'SKIP',
    };
    const key = randomUUID();
    const firstResponse = await api.post('/api/v1/prediction-batches', {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(firstResponse.status()).toBe(202);
    const first = (await firstResponse.json()) as Batch;
    const repeatedResponse = await api.post('/api/v1/prediction-batches', {
      data: body,
      headers: { 'Idempotency-Key': key },
    });
    expect(((await repeatedResponse.json()) as Batch).id).toBe(first.id);
    await expect
      .poll(
        async () => {
          const response = await api.get(`/api/v1/prediction-batches/${first.id}`);
          return ((await response.json()) as Batch).status;
        },
        { timeout: 120000, intervals: [500, 1000, 2000] },
      )
      .toBe('COMPLETED');

    const secondResponse = await api.post('/api/v1/prediction-batches', {
      data: body,
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(secondResponse.status()).toBe(202);
    const second = (await secondResponse.json()) as Batch;
    let completed: Batch | null = null;
    await expect
      .poll(
        async () => {
          const response = await api.get(`/api/v1/prediction-batches/${second.id}`);
          completed = (await response.json()) as Batch;
          return completed.status;
        },
        { timeout: 120000, intervals: [500, 1000, 2000] },
      )
      .toBe('COMPLETED');
    expect(completed!.totalFixtures).toBeGreaterThan(0);
    expect(completed!.skippedCount).toBeGreaterThan(0);

    const itemsResponse = await api.get(
      `/api/v1/prediction-batches/${second.id}/predictions?limit=100`,
    );
    const items = (await itemsResponse.json()) as { items: BatchItem[] };
    const skipped = items.items.find((item) => item.status === 'SKIPPED' && item.prediction);
    expect(skipped).toBeTruthy();
    const existingId = skipped!.prediction!.id;
    const detailResponse = await api.get(`/api/v1/predictions/${existingId}`);
    const detail = (await detailResponse.json()) as {
      id: string;
      snapshot: unknown;
      modelVersion: string;
    };
    expect(detail.id).toBe(existingId);
    expect(detail.snapshot).toBeTruthy();
    expect(detail.modelVersion).toBeTruthy();

    const versionResponse = await api.post('/api/v1/prediction-batches', {
      data: { ...body, existingPredictionPolicy: 'NEW_VERSION' },
      headers: { 'Idempotency-Key': randomUUID() },
    });
    expect(versionResponse.status()).toBe(202);
    const versionBatch = (await versionResponse.json()) as Batch;
    let versionComplete: Batch | null = null;
    await expect
      .poll(
        async () => {
          const response = await api.get(`/api/v1/prediction-batches/${versionBatch.id}`);
          versionComplete = (await response.json()) as Batch;
          return versionComplete.status;
        },
        { timeout: 120000, intervals: [500, 1000, 2000] },
      )
      .toBe('COMPLETED');
    expect(versionComplete!.generatedCount).toBeGreaterThan(0);
    const versionsResponse = await api.get(`/api/v1/fixtures/${skipped!.fixture.id}/predictions`);
    const versions = (await versionsResponse.json()) as { id: string }[];
    expect(versions.length).toBeGreaterThan(1);
    expect(versions.map((prediction) => prediction.id)).toContain(existingId);
  } finally {
    await api.dispose();
  }
});
