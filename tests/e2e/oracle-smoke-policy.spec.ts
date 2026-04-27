import { expect, test, type Page } from '@playwright/test';

type QualityProfile = 'ultra' | 'high' | 'medium' | 'low' | 'safe';
type SmokePolicyState = 'premium' | 'simplified' | 'off';
type SmokePolicySource = 'forced' | 'quality-profile' | 'runtime-budget';

const EXPECTED_SMOKE_BY_PROFILE: Record<QualityProfile, SmokePolicyState> = {
  ultra: 'premium',
  high: 'premium',
  medium: 'simplified',
  low: 'simplified',
  safe: 'off',
};

const VALID_SMOKE_SOURCES: SmokePolicySource[] = [
  'forced',
  'quality-profile',
  'runtime-budget',
];

async function waitForAuditBridge(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const bridge = (window as any).__ORB_AUDIT__;
          return Boolean(bridge?.ready?.());
        }),
      { timeout: 30_000, message: '__ORB_AUDIT__ ready() should become true' },
    )
    .toBe(true);
}

async function applyQualityProfile(
  page: Page,
  profile: QualityProfile,
  expectedSmokeState: SmokePolicyState,
  options: { reseed?: boolean } = {},
) {
  await page.evaluate(
    ({ nextProfile, reseed }) => {
      const bridge = (window as any).__ORB_AUDIT__;
      if (!bridge) throw new Error('__ORB_AUDIT__ missing');

      if (reseed) {
        bridge.setSeed?.(`smoke-policy-${nextProfile}`);
      }

      bridge.setProgress?.(0.82);
      bridge.setQualityProfile?.(nextProfile);
    },
    { nextProfile: profile, reseed: options.reseed === true },
  );

  await expect
    .poll(
      async () =>
        page.evaluate(
          ({ nextProfile, expectedState }) => {
            const bridge = (window as any).__ORB_AUDIT__;
            const snapshot = bridge?.snapshot?.();

            const active =
              snapshot?.telemetry?.activeQualityProfile === nextProfile ||
              snapshot?.qualityProfiles?.current === nextProfile;

            const smokeState = snapshot?.telemetry?.smokePolicyState ?? null;
            const volumeState = snapshot?.volumeEffective?.smokePolicyState ?? null;
            const alpha = snapshot?.telemetry?.smokeAlphaLayer;
            const compensation = snapshot?.telemetry?.smokeCompensation;

            return {
              active,
              smokeState,
              volumeState,
              source: snapshot?.telemetry?.smokePolicySource ?? null,
              alphaBounded:
                typeof alpha === 'number' &&
                Number.isFinite(alpha) &&
                alpha >= 0 &&
                alpha <= 1,
              compensationReady:
                Boolean(compensation) &&
                Number.isFinite(compensation.fogDensityMultiplier) &&
                Number.isFinite(compensation.glowIntensityMultiplier) &&
                Number.isFinite(compensation.volumetricBackgroundMultiplier) &&
                Number.isFinite(compensation.additiveAlphaMultiplier),
              ready:
                active === true &&
                smokeState === expectedState &&
                volumeState === expectedState,
            };
          },
          { nextProfile: profile, expectedState: expectedSmokeState },
        ),
      {
        timeout: 15_000,
        message: `quality profile ${profile} should expose smoke ${expectedSmokeState}`,
      },
    )
    .toMatchObject({
      active: true,
      smokeState: expectedSmokeState,
      volumeState: expectedSmokeState,
      alphaBounded: true,
      compensationReady: true,
      ready: true,
    });
}

async function readSnapshot(page: Page) {
  return page.evaluate(() => {
    const bridge = (window as any).__ORB_AUDIT__;
    if (!bridge?.snapshot) throw new Error('__ORB_AUDIT__.snapshot missing');
    return bridge.snapshot();
  });
}

function expectSmokeTelemetryContract(snapshot: any, expectedState: SmokePolicyState) {
  const telemetry = snapshot?.telemetry;
  expect(telemetry, 'snapshot.telemetry exists').toBeTruthy();

  expect(telemetry.smokePolicyState).toBe(expectedState);
  expect(VALID_SMOKE_SOURCES).toContain(telemetry.smokePolicySource);

  expect(typeof telemetry.smokeAlphaLayer).toBe('number');
  expect(Number.isFinite(telemetry.smokeAlphaLayer)).toBe(true);
  expect(telemetry.smokeAlphaLayer).toBeGreaterThanOrEqual(0);
  expect(telemetry.smokeAlphaLayer).toBeLessThanOrEqual(1);

  expect(telemetry.smokeCompensation).toMatchObject({
    fogDensityMultiplier: expect.any(Number),
    glowIntensityMultiplier: expect.any(Number),
    volumetricBackgroundMultiplier: expect.any(Number),
    additiveAlphaMultiplier: expect.any(Number),
  });

  for (const value of Object.values(telemetry.smokeCompensation)) {
    expect(Number.isFinite(value as number)).toBe(true);
  }

  expect(snapshot.volumeEffective).toBeTruthy();
  expect(snapshot.volumeEffective.smokePolicyState).toBe(expectedState);
  expect(snapshot.volumeEffective.smokeCompensation).toMatchObject({
    fogDensityMultiplier: expect.any(Number),
    glowIntensityMultiplier: expect.any(Number),
    volumetricBackgroundMultiplier: expect.any(Number),
    additiveAlphaMultiplier: expect.any(Number),
  });
}

function expectReadableScene(snapshot: any) {
  const sceneStats = snapshot?.sceneStats ?? {};
  const fluidMetrics = snapshot?.fluidMetrics ?? {};

  expect(sceneStats.hasRenderableContent).toBe(true);
  expect(Number(sceneStats.totalVisibleDrawablesExcludingProbe ?? 0)).toBeGreaterThan(0);
  expect(Number(sceneStats.baseVisibleDrawablesExcludingProbe ?? 0)).toBeGreaterThan(0);

  expect(Number(fluidMetrics.rebuildCount ?? 0)).toBeGreaterThanOrEqual(0);
  expect(Number(fluidMetrics.fallbackHits ?? 0)).toBeGreaterThanOrEqual(0);
}

test.describe('Oracle governed smoke policy E2E contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__ORB_DEBUG_VISIBLE_PROBE__ = false;
    });
    await waitForAuditBridge(page);
    await page.evaluate(() => {
      const bridge = (window as any).__ORB_AUDIT__;
      bridge?.setSeed?.('smoke-policy-canonical');
      bridge?.setProgress?.(0.82);
    });
  });

  test('maps quality profiles to canonical smoke states', async ({ page }) => {
    for (const [profile, expectedSmokeState] of Object.entries(
      EXPECTED_SMOKE_BY_PROFILE,
    ) as Array<[QualityProfile, SmokePolicyState]>) {
      await applyQualityProfile(page, profile, expectedSmokeState);
      const snapshot = await readSnapshot(page);

      expectSmokeTelemetryContract(snapshot, expectedSmokeState);
      expectReadableScene(snapshot);
    }
  });

  test('safe/off reduces smoke and additive pressure without killing readability', async ({
    page,
  }) => {
    await applyQualityProfile(page, 'ultra', 'premium');
    const ultra = await readSnapshot(page);

    await applyQualityProfile(page, 'safe', 'off');
    const safe = await readSnapshot(page);

    expectSmokeTelemetryContract(ultra, 'premium');
    expectSmokeTelemetryContract(safe, 'off');
    expectReadableScene(safe);

    const ultraComp = ultra.telemetry.smokeCompensation;
    const safeComp = safe.telemetry.smokeCompensation;

    // safe/off coupe la pression fumée/additive, mais peut augmenter le brouillard
    // comme compensation de lisibilité lorsque le volume est fortement réduit.
    expect(safe.telemetry.smokeAlphaLayer).toBeLessThanOrEqual(
      ultra.telemetry.smokeAlphaLayer,
    );

    expect(safeComp.volumetricBackgroundMultiplier).toBeLessThanOrEqual(
      ultraComp.volumetricBackgroundMultiplier,
    );
    expect(safeComp.additiveAlphaMultiplier).toBeLessThanOrEqual(
      ultraComp.additiveAlphaMultiplier,
    );
    expect(safeComp.glowIntensityMultiplier).toBeLessThanOrEqual(
      ultraComp.glowIntensityMultiplier,
    );

    expect(safeComp.fogDensityMultiplier).toBeGreaterThanOrEqual(
      ultraComp.fogDensityMultiplier,
    );
    expect(safeComp.fogDensityMultiplier).toBeLessThanOrEqual(1.25);

    const ultraFluidTarget = Number(ultra.fluidMetrics?.targetMaxCount ?? 0);
    const safeFluidTarget = Number(safe.fluidMetrics?.targetMaxCount ?? 0);

    if (ultraFluidTarget > 0 && safeFluidTarget > 0) {
      expect(safeFluidTarget).toBeLessThanOrEqual(ultraFluidTarget);
    }
  });

  test('medium/simplified acts as the stable transition profile', async ({ page }) => {
    await applyQualityProfile(page, 'medium', 'simplified');
    const medium = await readSnapshot(page);

    expectSmokeTelemetryContract(medium, 'simplified');
    expectReadableScene(medium);

    expect(medium.telemetry.smokeCompensation.additiveAlphaMultiplier).toBeGreaterThan(0);
    expect(medium.telemetry.smokeCompensation.volumetricBackgroundMultiplier).toBeGreaterThan(0);
  });

  test('re-applying safe profile does not cause fluid rebuild pumping', async ({ page }) => {
    await applyQualityProfile(page, 'safe', 'off');
    const before = await readSnapshot(page);

    await applyQualityProfile(page, 'safe', 'off');
    await applyQualityProfile(page, 'safe', 'off');

    const after = await readSnapshot(page);

    const beforeRebuilds = Number(before.fluidMetrics?.rebuildCount ?? 0);
    const afterRebuilds = Number(after.fluidMetrics?.rebuildCount ?? 0);

    expect(afterRebuilds - beforeRebuilds).toBeLessThanOrEqual(2);
    expectSmokeTelemetryContract(after, 'off');
    expectReadableScene(after);
  });
});
