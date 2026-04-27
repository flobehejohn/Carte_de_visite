import { expect, test } from '@playwright/test';
import {
  expectOracleCanvasSnapshot,
  prepareOracleVrtScenario,
  type VrtQualityProfile,
} from './utils/orbScenario';

const SMOKE_VRT_SCENARIOS: Array<{
  label: string;
  profile: VrtQualityProfile;
  expectedSmokeState: 'premium' | 'simplified' | 'off';
  screenshot: string;
}> = [
  {
    label: 'fumée premium / profil ultra',
    profile: 'ultra',
    expectedSmokeState: 'premium',
    screenshot: 'oracle-smoke-profile-ultra.png',
  },
  {
    label: 'fumée simplifiée / profil medium',
    profile: 'medium',
    expectedSmokeState: 'simplified',
    screenshot: 'oracle-smoke-profile-medium.png',
  },
  {
    label: 'fumée désactivée / profil safe',
    profile: 'safe',
    expectedSmokeState: 'off',
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

      expect(snapshot?.telemetry?.smokePolicyState).toBe(scenario.expectedSmokeState);
      expect(snapshot?.telemetry?.smokeAlphaLayer).toBeGreaterThanOrEqual(0);
      expect(snapshot?.telemetry?.smokeAlphaLayer).toBeLessThanOrEqual(1);
      expect(snapshot?.telemetry?.smokeCompensation).toMatchObject({
        fogDensityMultiplier: expect.any(Number),
        glowIntensityMultiplier: expect.any(Number),
        volumetricBackgroundMultiplier: expect.any(Number),
        additiveAlphaMultiplier: expect.any(Number),
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