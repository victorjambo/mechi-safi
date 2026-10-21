import { expect, test } from '@playwright/test';

test('manual prediction and historical backtest workflows', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Admin password').fill(process.env.ADMIN_PASSWORD ?? 'change-this-long-private-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you' })).toBeVisible();

  await page.getByRole('link', { name: 'Generate Predictions' }).first().click();
  await expect(page.getByRole('heading', { name: 'Generate Predictions', level: 2 })).toBeVisible();
  await page.getByLabel('Prediction period').selectOption('24');
  await expect(page.getByText('selected').first()).toBeVisible();
  await page.getByRole('button', { name: 'Generate Predictions' }).click();
  await expect(page.getByText('Current batch')).toBeVisible();
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText('Batch predictions')).toBeVisible();
  const details = page.getByRole('link', { name: 'Details', exact: true }).first();
  await expect(details).toBeVisible();
  await details.click();
  await expect(page.getByText('1X2 probability distribution')).toBeVisible();
  await expect(page.getByText('Pre-match feature snapshot')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Prediction History' }).click();
  await expect(page.getByRole('heading', { name: 'Prediction history', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: 'All predictions' }).click();
  await expect(page.getByRole('link', { name: 'Details', exact: true }).first()).toBeVisible();

  await page.getByRole('link', { name: 'Backtesting' }).click();
  await page.getByRole('checkbox', { name: 'Premier League' }).check();
  await page.getByRole('button', { name: '2024', exact: true }).click();
  await expect(page.getByRole('button', { name: '2024', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Start backtest' })).toBeEnabled();
  const submitted = page.waitForResponse((response) => response.url().endsWith('/api/v1/backtests') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start backtest' }).click();
  const response = await submitted;
  expect(response.status()).toBe(202);
  const created = await response.json() as { id: string };
  await expect(page.getByText('Current run')).toBeVisible();
  await expect(page.getByTestId('current-backtest')).toContainText(created.id.slice(0, 8));
  await expect(page.getByTestId('current-backtest').getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 120000 });
  await expect(page.getByText('Brier score')).toBeVisible();
});
