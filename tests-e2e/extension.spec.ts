// E2E skeleton using Playwright. Requires TEST_MODE=true and a dev server (vite) serving /mock.
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import type { TestInfo } from '@playwright/test';

test.describe('Extension E2E on mock (TEST_MODE)', () => {
  test.skip(process.env.TEST_MODE !== 'true', 'Run with TEST_MODE=true and launchPersistentContext');

  async function launchWithExtension(testInfo: TestInfo) {
    const userDataDir = testInfo.outputPath('user-data-dir');
    const pathToExtension = path.resolve(process.cwd(), 'dist');

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    const page = await context.newPage();
    await page.goto('http://localhost:5173/src/mock/index.html');

    // Wait a bit for content script
    await page.waitForTimeout(500);
    return { context, page };
  }

  function localTimeForTimelineSecond(targetSecond: number, rangeEndSecond: number): string {
    const latencySecond = 20;
    const date = new Date(Date.now() - (latencySecond + rangeEndSecond - targetSecond) * 1000);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Amsterdam',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    const hour = value('hour') === '24' ? '00' : value('hour');
    return `${hour}:${value('minute')}:${value('second')}`;
  }

  test('mounts Shadow DOM root', async ({}, testInfo) => {
    const { context, page } = await launchWithExtension(testInfo);
    try {
      const hasRoot = await page.evaluate(() => !!document.getElementById('yt-longseek-tsjump-root'));
      expect(hasRoot).toBeTruthy();
    } finally {
      await context.close();
    }
  });

  test('±シークと端クランプ（カスタムボタン）', async ({}, testInfo) => {
    const { context, page } = await launchWithExtension(testInfo);
    try {
      // DVR窓を 0..120 秒に設定
      await page.evaluate(() => { (window as any).__mock.setRange(0, 120); });

      // カードを開く → カスタムボタン表示
      await page.keyboard.press('Alt+Shift+J');
      await page.locator('#yt-longseek-tsjump-root button[title="Show custom buttons"]').click();

      // +60m を押すと end-guard=117 へクランプ
      await page.locator('#yt-longseek-tsjump-root .custom-button', { hasText: '+60m' }).click();
      const t1 = await page.evaluate(() => (document.getElementById('v') as HTMLVideoElement).currentTime);
      expect(Math.round(t1)).toBe(117);

      // -10m で 117-600 → 0 へクランプ
      await page.locator('#yt-longseek-tsjump-root .custom-button', { hasText: '-10m' }).click();
      const t2 = await page.evaluate(() => (document.getElementById('v') as HTMLVideoElement).currentTime);
      expect(Math.round(t2)).toBe(0);

    } finally {
      await context.close();
    }
  });

  test('広告抑止中はカスタムボタンで時間が変わらない', async ({}, testInfo) => {
    const { context, page } = await launchWithExtension(testInfo);
    try {
      await page.evaluate(() => { (window as any).__mock.setRange(0, 1000); });
      await page.evaluate(() => { (document.getElementById('v') as HTMLVideoElement).currentTime = 50; });

      await page.keyboard.press('Alt+Shift+J');
      await page.locator('#yt-longseek-tsjump-root button[title="Show custom buttons"]').click();

      // 広告ON
      await page.evaluate(() => { (window as any).__mock.setAd(true); });
      await page.locator('#yt-longseek-tsjump-root .custom-button', { hasText: '+10m' }).click();
      const afterAd = await page.evaluate(() => (document.getElementById('v') as HTMLVideoElement).currentTime);
      expect(Math.round(afterAd)).toBe(50); // 変わらない

      // 広告OFF → もう一度 +10m
      await page.evaluate(() => { (window as any).__mock.setAd(false); });
      await page.locator('#yt-longseek-tsjump-root .custom-button', { hasText: '+10m' }).click();
      const after = await page.evaluate(() => (document.getElementById('v') as HTMLVideoElement).currentTime);
      expect(after).toBeGreaterThan(50);

    } finally {
      await context.close();
    }
  });

  test('時刻ジャンプ入力で範囲内へ移動（ざっくり検証）', async ({}, testInfo) => {
    const { context, page } = await launchWithExtension(testInfo);
    try {
      await page.evaluate(() => { (window as any).__mock.setRange(0, 500); });
      await page.evaluate(() => { (document.getElementById('v') as HTMLVideoElement).currentTime = 0; });

      await page.keyboard.press('Alt+Shift+J');
      const input = page.locator('#yt-longseek-tsjump-root input[placeholder="HH:mm:ss or HHmmss"]');
      await input.fill(localTimeForTimelineSecond(10, 500));
      await input.press('Enter');
      await page.waitForTimeout(200);

      const cur = await page.evaluate(() => (document.getElementById('v') as HTMLVideoElement).currentTime);
      // 0 < currentTime < end-guard=497 程度に入っていればOK（正確な値までは縛らない）
      expect(cur).toBeGreaterThan(0);
      expect(cur).toBeLessThan(497.1);

    } finally {
      await context.close();
    }
  });
});
