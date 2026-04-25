import { test, expect } from '@playwright/test';

test('prod-like bridge remains complete after startup and warmup', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => {
    const audit = (window as any).__ORB_AUDIT__;
    return Boolean(
      audit &&
      typeof audit.ready === 'function' &&
      typeof audit.snapshot === 'function' &&
      typeof audit.setQualityProfile === 'function' &&
      typeof audit.setRenderMode === 'function' &&
      typeof audit.setVisibleSafeMode === 'function'
    );
  }, { timeout: 20000 });

  await page.waitForTimeout(4000);

  const payload = await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    const snap = audit?.snapshot?.();

    return {
      auditType: typeof audit,
      readyType: typeof audit?.ready,
      snapshotType: typeof audit?.snapshot,
      setQualityProfileType: typeof audit?.setQualityProfile,
      setRenderModeType: typeof audit?.setRenderMode,
      setVisibleSafeModeType: typeof audit?.setVisibleSafeMode,
      keys: audit ? Object.keys(audit).sort() : [],
      telemetryKeys: snap?.telemetry ? Object.keys(snap.telemetry).sort() : [],
      qualityProfile: snap?.qualityProfile ?? null,
      renderMode: snap?.renderMode ?? null,
      smokePolicyState: snap?.telemetry?.smokePolicyState ?? null,
      smokePolicySource: snap?.telemetry?.smokePolicySource ?? null,
      smokeAlphaLayer: snap?.telemetry?.smokeAlphaLayer ?? null,
    };
  });

  expect(payload.auditType).toBe('object');
  expect(payload.readyType).toBe('function');
  expect(payload.snapshotType).toBe('function');
  expect(payload.setQualityProfileType).toBe('function');
  expect(payload.setRenderModeType).toBe('function');
  expect(payload.setVisibleSafeModeType).toBe('function');

  expect(payload.telemetryKeys).toContain('smokePolicyState');
  expect(payload.telemetryKeys).toContain('smokePolicySource');
  expect(payload.telemetryKeys).toContain('smokeAlphaLayer');
});
