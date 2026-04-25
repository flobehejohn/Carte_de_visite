import { test } from '@playwright/test';
import { expectOracleCanvasSnapshot, prepareOracleVrtScenario } from './utils/orbScenario';

test.describe('VRT — Oracle profile safe', () => {
  test('rend un baseline stable en profil safe', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 390, height: 844 });

    const snapshot = await prepareOracleVrtScenario(page, testInfo, {
      profile: 'safe',
      seed: 424242,
      progress: 0.72,
      renderMode: 'composer-bloom',
      waitMs: 1_000,
    });

    await testInfo.attach('oracle-profile-safe.snapshot.json', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });

    await expectOracleCanvasSnapshot(page, testInfo, 'oracle-profile-safe.png', {
      maxDiffPixelRatio: 0.28,
      threshold: 0.55,
      timeoutMs: 120_000,
    });
  });
});