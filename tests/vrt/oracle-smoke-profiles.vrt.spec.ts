import { test, expect } from '@playwright/test';

const PROFILES = ['ultra', 'medium', 'safe'] as const;

for (const profile of PROFILES) {
  test(`oracle smoke visual candidate (${profile})`, async ({ page }, testInfo) => {
    await page.goto('/');

    await page.waitForFunction(() => {
      const audit = (window as any).__ORB_AUDIT__;
      return Boolean(audit && typeof audit.ready === 'function' && audit.ready());
    }, null, { timeout: 30000 });

    await page.evaluate((nextProfile) => {
      const audit = (window as any).__ORB_AUDIT__;
      audit.setSeed?.('pass2-vrt-smoke');
      audit.setProgress?.(0.72);
      audit.setFluidParticlesVisible?.(true);
      audit.setQualityProfile?.(nextProfile);
    }, profile);

    await page.waitForTimeout(900);

    const snapshot = await page.evaluate(() => {
      const audit = (window as any).__ORB_AUDIT__;
      return audit.snapshot();
    });

    const filePath = testInfo.outputPath(`oracle-smoke-${profile}.png`);
    const shot = await page.screenshot({
      path: filePath,
      fullPage: true,
    });

    expect(shot.byteLength).toBeGreaterThan(1000);
    expect(typeof snapshot).toBe('object');
    expect(snapshot).toHaveProperty('telemetry');

    const smoke = snapshot?.telemetry?.smokeAlphaLayer ?? null;
    expect(
      smoke === null || (typeof smoke === 'number' && Number.isFinite(smoke)),
    ).toBe(true);

    await testInfo.attach(`oracle-smoke-${profile}`, {
      path: filePath,
      contentType: 'image/png',
    });
  });
}
