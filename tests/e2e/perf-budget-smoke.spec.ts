import { devices, expect, test } from '@playwright/test';
import {
    assertStructuralSmoke,
    buildSnapshotDiagnostics,
    buildStructuralSummary,
    gotoOracleRoot,
    readSerializableSnapshot,
    waitForOrbAuditHandle,
    waitForOrbAuditReady,
} from './utils/orbAudit';

test.describe('Phase 3 — E2E perf smoke desktop + mobile', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: 90_000,
  });

  test('Chromium desktop — présence, forme, cohérence, types', async ({
    page,
  }, testInfo) => {
    await gotoOracleRoot(page, testInfo);

    const boot = await waitForOrbAuditHandle(page);
    expect(boot.exists).toBe(true);
    expect(boot.hasReadyFn).toBe(true);
    expect(boot.hasSnapshotFn).toBe(true);

    const readyState = await waitForOrbAuditReady(page);
    expect(readyState.ready).toBe(true);

    const snapshot = await readSerializableSnapshot(page);
    assertStructuralSmoke(snapshot, { deviceKind: 'desktop' });

    const diagnostics = buildSnapshotDiagnostics(snapshot);
    const summary = buildStructuralSummary(snapshot);

    await testInfo.attach('orb-audit-desktop.json', {
      body: JSON.stringify(
        {
          phase: '3.2-structural-smoke',
          device: 'desktop',
          boot,
          readyState,
          summary,
          diagnostics,
          snapshot,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });

  test('Mobile emulated — présence, forme, cohérence, types', async ({
    browser,
  }, testInfo) => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      locale: 'fr-FR',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });

    const page = await context.newPage();

    try {
      await gotoOracleRoot(page, testInfo);

      const boot = await waitForOrbAuditHandle(page);
      expect(boot.exists).toBe(true);
      expect(boot.hasReadyFn).toBe(true);
      expect(boot.hasSnapshotFn).toBe(true);

      const readyState = await waitForOrbAuditReady(page);
      expect(readyState.ready).toBe(true);

      const snapshot = await readSerializableSnapshot(page);
      assertStructuralSmoke(snapshot, { deviceKind: 'mobile' });

      const diagnostics = buildSnapshotDiagnostics(snapshot);
      const summary = buildStructuralSummary(snapshot);

      await testInfo.attach('orb-audit-mobile.json', {
        body: JSON.stringify(
          {
            phase: '3.2-structural-smoke',
            device: 'mobile',
            boot,
            readyState,
            summary,
            diagnostics,
            snapshot,
          },
          null,
          2,
        ),
        contentType: 'application/json',
      });
    } finally {
      await context.close();
    }
  });
});
