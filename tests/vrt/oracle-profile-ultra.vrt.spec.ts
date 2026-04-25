import { test } from '@playwright/test';
import { expectOracleCanvasSnapshot, prepareOracleVrtScenario } from './utils/orbScenario';

test.describe('VRT — Oracle profile ultra', () => {
  test('rend un baseline stable en profil ultra', async ({ page }, testInfo) => {
    test.setTimeout(240_000);

    await page.setViewportSize({ width: 960, height: 540 });

    const snapshot = await prepareOracleVrtScenario(page, testInfo, {
      profile: 'ultra',
      seed: 424242,
      progress: 0.72,
      renderMode: 'composer-bloom',
      waitMs: 1_000,
    });

    await testInfo.attach('oracle-profile-ultra.snapshot.json', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });

    await expectOracleCanvasSnapshot(page, testInfo, 'oracle-profile-ultra.png', {
      maxDiffPixelRatio: 0.25,
      threshold: 0.5,
      timeoutMs: 120_000,
    });
  });
});