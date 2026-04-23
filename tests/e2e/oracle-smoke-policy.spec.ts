import { test, expect } from '@playwright/test';

test('smoke policy audit bridge stays coherent across quality profiles', async ({ page }, testInfo) => {
  await page.goto('/');

  await page.waitForFunction(() => {
    const audit = (window as any).__ORB_AUDIT__;
    return Boolean(audit && typeof audit.ready === 'function' && audit.ready());
  }, null, { timeout: 30000 });

  await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    audit.setSeed?.('pass2-smoke-policy');
    audit.setProgress?.(0.72);
    audit.setFluidParticlesVisible?.(true);
  });

  await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    audit.setQualityProfile?.('ultra');
  });

  await page.waitForTimeout(700);

  const ultraSnapshot = await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    return audit.snapshot();
  });

  await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    audit.setQualityProfile?.('safe');
  });

  await page.waitForTimeout(700);

  const safeSnapshot = await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    return audit.snapshot();
  });

  expect(typeof ultraSnapshot).toBe('object');
  expect(typeof safeSnapshot).toBe('object');

  expect(ultraSnapshot).toHaveProperty('qualityProfiles');
  expect(safeSnapshot).toHaveProperty('qualityProfiles');
  expect(ultraSnapshot).toHaveProperty('telemetry');
  expect(safeSnapshot).toHaveProperty('telemetry');

  const ultraSmoke = ultraSnapshot?.telemetry?.smokeAlphaLayer ?? null;
  const safeSmoke = safeSnapshot?.telemetry?.smokeAlphaLayer ?? null;

  expect(
    ultraSmoke === null || (typeof ultraSmoke === 'number' && Number.isFinite(ultraSmoke)),
  ).toBe(true);

  expect(
    safeSmoke === null || (typeof safeSmoke === 'number' && Number.isFinite(safeSmoke)),
  ).toBe(true);

  if (typeof ultraSmoke === 'number' && typeof safeSmoke === 'number') {
    expect(safeSmoke).toBeLessThanOrEqual(ultraSmoke);
  }

  const payload = {
    ultra: {
      qualityProfile: ultraSnapshot?.qualityProfile ?? null,
      qualityProfiles: ultraSnapshot?.qualityProfiles ?? null,
      smokeAlphaLayer: ultraSmoke,
      renderMode: ultraSnapshot?.renderMode ?? null,
    },
    safe: {
      qualityProfile: safeSnapshot?.qualityProfile ?? null,
      qualityProfiles: safeSnapshot?.qualityProfiles ?? null,
      smokeAlphaLayer: safeSmoke,
      renderMode: safeSnapshot?.renderMode ?? null,
    },
  };

  await testInfo.attach('smoke-policy-snapshots', {
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    contentType: 'application/json',
  });
});
