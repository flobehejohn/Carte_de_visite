import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __ORB_AUDIT__?: {
      ready?: () => boolean | Promise<boolean>;
      setSeed?: (seed: number | string) => unknown;
      setProgress?: (progress: number) => unknown;
      snapshot?: () => unknown;
    };
  }
}

test.describe('Pass 5.C — governed runtime optics snapshot', () => {
  test('exposes bloom and iridescence policies through snapshot and telemetry', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      async () => {
        const bridge = window.__ORB_AUDIT__;

        if (!bridge) {
          return false;
        }

        if (typeof bridge.ready !== 'function') {
          return true;
        }

        return Boolean(await bridge.ready());
      },
      undefined,
      { timeout: 30_000 },
    );

    await page.evaluate(() => {
      window.__ORB_AUDIT__?.setSeed?.(5051);
      window.__ORB_AUDIT__?.setProgress?.(0.72);
    });

    await page.waitForTimeout(1_000);

    const snapshot = await page.evaluate(() => {
      return window.__ORB_AUDIT__?.snapshot?.() as any;
    });

    expect(snapshot).toBeTruthy();
    expect(snapshot.bloomPolicy).toBeTruthy();
    expect(snapshot.iridescencePolicy).toBeTruthy();
    expect(snapshot.telemetry).toBeTruthy();

    expect(snapshot.telemetry.bloomPolicyState).toBeTruthy();
    expect(snapshot.telemetry.iridescencePolicyState).toBeTruthy();

    expect(typeof snapshot.telemetry.bloomStrength).toBe('number');
    expect(typeof snapshot.telemetry.bloomRadius).toBe('number');
    expect(typeof snapshot.telemetry.bloomThreshold).toBe('number');

    expect(snapshot.telemetry.bloomStrength).toBe(snapshot.bloomPolicy.strength);
    expect(snapshot.telemetry.bloomRadius).toBe(snapshot.bloomPolicy.radius);
    expect(snapshot.telemetry.bloomThreshold).toBe(snapshot.bloomPolicy.threshold);
  });
});