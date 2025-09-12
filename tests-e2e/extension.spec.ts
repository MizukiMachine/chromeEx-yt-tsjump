// E2E skeleton using Playwright. Requires TEST_MODE=true and a dev server (vite) serving /mock.
import { test, expect, chromium } from '@playwright/test';
import path from 'path';

const EXT_DIR = path.resolve(__dirname, '..');

test.describe('Extension basic wiring (TEST_MODE)', () => {
  test.skip(process.env.TEST_MODE !== 'true', 'Run with TEST_MODE=true and launchPersistentContext');

  test('loads on mock page and mounts Shadow DOM root', async () => {
    const userDataDir = path.join(process.cwd(), '.pw-chromium');
    const pathToExtension = path.resolve(process.cwd(), 'dist');

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/mock/index.html');

    // Wait a bit for content script
    await page.waitForTimeout(500);

    // Verify root exists
    const hasRoot = await page.evaluate(() => !!document.getElementById('yt-longseek-tsjump-root'));
    expect(hasRoot).toBeTruthy();

    await context.close();
  });
});

