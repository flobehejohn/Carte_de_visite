import { test } from '@playwright/test';
import {
  expectOracleCanvasSnapshot,
  prepareOracleVrtScenario,
  type VrtQualityProfile,
} from './utils/orbScenario';

const SMOKE_VRT_SCENARIOS: Array<{
  label: string;
  profile: VrtQualityProfile;
  screenshot: string;
}> = [
  {
    label: 'fumée premium / profil ultra',
    profile: 'ultra',
    screenshot: 'oracle-smoke-profile-ultra.png',
  },
  {
    label: 'fumée réduite / profil safe',
    profile: 'safe',
    screenshot: 'oracle-smoke-profile-safe.png',
  },
];

test.describe('VRT — Oracle smoke profiles', () => {
  for (const scenario of SMOKE_VRT_SCENARIOS) {
    test(scenario.label, async ({ page }, testInfo) => {
      test.setTimeout(240_000);

      await page.setViewportSize({ width: 960, height: 540 });

      const snapshot = await prepareOracleVrtScenario(page, testInfo, {
        profile: scenario.profile,
        seed: 777001,
        progress: 0.58,
        renderMode: 'composer-bloom',
        waitMs: 1_000,
      });

      await testInfo.attach(`${scenario.screenshot}.snapshot.json`, {
        body: JSON.stringify(snapshot, null, 2),
        contentType: 'application/json',
      });

      await expectOracleCanvasSnapshot(page, testInfo, scenario.screenshot, {
        maxDiffPixelRatio: 0.28,
        threshold: 0.55,
        timeoutMs: 120_000,
      });
    });
  }
});