import { expect, test } from '@playwright/test';

test('dashboard and mobile navigation render', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByLabel('Admin password').fill(process.env.ADMIN_PASSWORD ?? 'change-this-long-private-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you' })).toBeVisible();
  await expect(page.getByText('Total predictions')).toBeVisible();
  await expect(page.getByRole('link', { name: / vs / }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/dashboard.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Backtesting' })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-nav.png', fullPage: true });
});
