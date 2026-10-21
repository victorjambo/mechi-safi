import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', timeout: 120000, expect: { timeout: 15000 }, use: { baseURL: process.env.WEB_ORIGIN ?? 'http://localhost:3000', ...devices['Desktop Chrome'] }, reporter: 'list' });
