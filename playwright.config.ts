import { defineConfig } from '@playwright/test';

const useMockServer = process.env.TEST_MODE === 'true';

export default defineConfig({
  testDir: './tests-e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5173',
  },
  ...(useMockServer
    ? {
        webServer: {
          command: 'node tests-e2e/mock-server.mjs',
          url: 'http://localhost:5173/src/mock/index.html',
          reuseExistingServer: !process.env.CI,
        },
      }
    : {}),
});
