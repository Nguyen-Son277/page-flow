import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 45000,
  use: { baseURL: 'http://localhost:3300', launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] }, screenshot: 'only-on-failure' },
  webServer: { command: 'pnpm exec next start -p 3300', url: 'http://localhost:3300/login', reuseExistingServer: false, timeout: 30000, env: { APP_URL: 'http://localhost:3300', DATABASE_URL: process.env.DATABASE_URL!, REDIS_URL: process.env.REDIS_URL!, DEMO_MODE: 'true', META_SEND_ENABLED: 'false' } }
});
