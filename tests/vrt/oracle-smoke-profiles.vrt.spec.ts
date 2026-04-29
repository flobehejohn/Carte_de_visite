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
  expectedBloomState: 'cinematic' | 'balanced' | 'off';
  expectedIridescenceStates: Array<'expressive' | 'subtle' | 'off'>;
  screenshot: string;
  maxDiffPixelRatio: number;
  threshold: number;
  waitMs: number;
}> = [
  {
    label: 'profil ultra / smoke premium / bloom cinematic',
    profile: 'ultra',
    expectedSmokeState: 'premium',
    expectedBloomState: 'cinematic',
    expectedIridescenceStates: ['expressive', 'subtle'],
    screenshot: 'oracle-smoke-profile-ultra.png',
    maxDiffPixelRatio: 0.08,
    threshold: 0.55,
    waitMs: 2_000,
  },
  {
    label: 'profil medium / smoke simplified / bloom balanced',
    profile: 'medium',
    expectedSmokeState: 'simplified',
    expectedBloomState: 'balanced',
    expectedIridescenceStates: ['expressive', 'subtle'],
    screenshot: 'oracle-smoke-profile-medium.png',
    maxDiffPixelRatio: 0.06,
    threshold: 0.55,
    waitMs: 2_000,
  },
  {
    label: 'profil safe / smoke off / bloom off',
    profile: 'safe',
    expectedSmokeState: 'off',
    expectedBloomState: 'off',
    expectedIridescenceStates: ['off'],
    screenshot: 'oracle-smoke-profile-safe.png',
    maxDiffPixelRatio: 0.04,
    threshold: 0.55,
    waitMs: 1_500,
  },
];

function readNestedString(payload: Record<string, unknown>, path: string): string | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function expectRichVrtSnapshot(snapshot: Record<string, unknown>): void {
  expect(snapshot).toBeTruthy();
  expect(Object.keys(snapshot).length).toBeGreaterThanOrEqual(25);
  expect(JSON.stringify(snapshot).length).toBeGreaterThan(1_000);
}

test.describe('Pass 5.E — VRT recalibrée ultra / medium / safe', () => {
  test.describe.configure({ mode: 'serial' });

  for (const scenario of SMOKE_VRT_SCENARIOS) {
    test(scenario.label, async ({ page }, testInfo) => {
      test.setTimeout(300_000);

      await page.setViewportSize({ width: 960, height: 540 });

      const snapshot = await prepareOracleVrtScenario(page, testInfo, {
        profile: scenario.profile,
        seed: 777001,
        progress: 0.58,
        renderMode: 'composer-bloom',
        waitMs: scenario.waitMs,
      });

      expectRichVrtSnapshot(snapshot);

      expect(readNestedString(snapshot, 'qualityProfiles.current')).toBe(scenario.profile);

      expect(readNestedString(snapshot, 'telemetry.smokePolicyState')).toBe(
        scenario.expectedSmokeState,
      );

      expect(readNestedString(snapshot, 'bloomPolicy.state')).toBe(
        scenario.expectedBloomState,
      );

      expect(readNestedString(snapshot, 'telemetry.bloomPolicyState')).toBe(
        scenario.expectedBloomState,
      );

      expect(scenario.expectedIridescenceStates).toContain(
        readNestedString(snapshot, 'iridescencePolicy.state'),
      );

      expect(scenario.expectedIridescenceStates).toContain(
        readNestedString(snapshot, 'telemetry.iridescencePolicyState'),
      );

      expect(readNestedString(snapshot, 'renderMode')).toBe('composer-bloom');

      expect(snapshot?.telemetry).toBeTruthy();
      expect(snapshot?.bloomPolicy).toBeTruthy();
      expect(snapshot?.iridescencePolicy).toBeTruthy();

      expect(snapshot?.telemetry).toMatchObject({
        smokeAlphaLayer: expect.any(Number),
        smokeCompensation: {
          fogDensityMultiplier: expect.any(Number),
          glowIntensityMultiplier: expect.any(Number),
          volumetricBackgroundMultiplier: expect.any(Number),
          additiveAlphaMultiplier: expect.any(Number),
        },
        bloomStrength: expect.any(Number),
        bloomRadius: expect.any(Number),
        bloomThreshold: expect.any(Number),
      });

      await testInfo.attach(`${scenario.screenshot}.snapshot.json`, {
        body: JSON.stringify(snapshot, null, 2),
        contentType: 'application/json',
      });

      await expectOracleCanvasSnapshot(page, testInfo, scenario.screenshot, {
        maxDiffPixelRatio: scenario.maxDiffPixelRatio,
        threshold: scenario.threshold,
        timeoutMs: 120_000,
      });
    });
  }
});