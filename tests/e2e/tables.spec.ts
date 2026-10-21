import { randomUUID } from 'node:crypto';
import { expect, request as apiRequest, test } from '@playwright/test';

type Batch = { id: string; status: string };

test('all data tables can filter and sort their rows', async ({ page }) => {
  const api = await apiRequest.newContext({
    baseURL: process.env.API_ORIGIN ?? 'http://127.0.0.1:4000',
  });
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { password: process.env.ADMIN_PASSWORD ?? 'change-this-long-private-password' },
    });
    expect(login.ok()).toBeTruthy();
    const createBatch = async (existingPredictionPolicy: 'SKIP' | 'NEW_VERSION') => {
      const response = await api.post('/api/v1/prediction-batches', {
        data: {
          periodHours: 24,
          competitions: ['PL'],
          predictionConfigId: 'default',
          existingPredictionPolicy,
        },
        headers: { 'Idempotency-Key': randomUUID() },
      });
      expect(response.status()).toBe(202);
      const batch = (await response.json()) as Batch;
      await expect
        .poll(
          async () => {
            const result = await api.get(`/api/v1/prediction-batches/${batch.id}`);
            return ((await result.json()) as Batch).status;
          },
          { timeout: 120000, intervals: [500, 1000, 2000] },
        )
        .toBe('COMPLETED');
      return batch.id;
    };
    const firstId = await createBatch('SKIP');
    const secondId = await createBatch('NEW_VERSION');

    await page.goto('/');
    await page
      .getByLabel('Admin password')
      .fill(process.env.ADMIN_PASSWORD ?? 'change-this-long-private-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Good to see you' })).toBeVisible();

    await page.goto('/fixtures');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByLabel('Search table teams or competition')).toBeVisible();
    await page.getByRole('button', { name: 'Sort by Kickoff, ascending' }).click();
    await expect(page.getByRole('columnheader', { name: 'Kickoff' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await page.getByLabel('Filter table status').selectOption('PREDICTED');
    await expect(page.getByRole('status')).toContainText('on this page');
    await page.getByRole('button', { name: 'Reset' }).click();

    await page.goto('/predictions/history');
    await expect(page.getByLabel('Search batches')).toBeVisible();
    await page.getByRole('button', { name: 'Sort by Generated' }).click();
    await expect(page.getByRole('columnheader', { name: 'Generated' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const generated = (
      await page.getByRole('table').locator('tbody tr td:nth-child(7)').allTextContents()
    ).map(Number);
    expect(generated).toEqual([...generated].sort((a, b) => a - b));
    await page.getByLabel('Filter statuses').selectOption('COMPLETED');
    await expect(page.getByRole('status')).toContainText('on this page');
    expect(
      (await page.getByRole('table').locator('tbody tr td:nth-child(11)').allTextContents()).every(
        (value) => value.trim() === 'COMPLETED',
      ),
    ).toBeTruthy();
    await page.getByLabel('Search batches').fill(firstId);
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset' }).click();

    await page.getByRole('button', { name: 'All predictions' }).click();
    await expect(page.getByLabel('Search table teams or competition')).toBeVisible();
    await page.getByRole('button', { name: 'Sort by Home %' }).click();
    await expect(page.getByRole('columnheader', { name: 'Home %' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(page.getByRole('status')).toContainText('on this page');

    await page.goto(`/predictions/batches/${firstId}?compare=${secondId}`);
    await expect(page.getByRole('heading', { name: 'Batch comparison' })).toBeVisible();
    await expect(page.getByLabel('Search comparison fixtures')).toBeVisible();
    await page.getByRole('button', { name: 'Sort by Current home %' }).click();
    await expect(page.getByRole('columnheader', { name: 'Current home %' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const homeProbabilities = (
      await page.getByRole('table').first().locator('tbody tr td:nth-child(4)').allTextContents()
    )
      .map((value) => Number.parseFloat(value))
      .filter(Number.isFinite);
    expect(homeProbabilities).toEqual([...homeProbabilities].sort((a, b) => a - b));
    await page.getByLabel('Filter current outcomes').selectOption('HOME_WIN');
    await expect(page.getByLabel('Filter current outcomes')).toHaveValue('HOME_WIN');
    expect(
      (
        await page.getByRole('table').first().locator('tbody tr td:nth-child(2)').allTextContents()
      ).every((value) => value.trim() === 'Home win'),
    ).toBeTruthy();
  } finally {
    await api.dispose();
  }
});
