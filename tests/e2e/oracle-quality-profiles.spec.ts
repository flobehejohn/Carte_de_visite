import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

const QUALITY_PROFILES = ['ultra', 'high', 'medium', 'low', 'safe'] as const;

type QualityProfileName = (typeof QUALITY_PROFILES)[number];

function readNestedString(payload: Record<string, unknown>, path: string): string | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

async function forceQualityProfile(page: Page, profile: QualityProfileName): Promise<void> {
  await page.evaluate(async (nextProfile) => {
    const audit = (window as any).__ORB_AUDIT__;

    if (!audit || typeof audit.setQualityProfile !== 'function') {
      throw new Error('__ORB_AUDIT__.setQualityProfile indisponible.');
    }

    await audit.setQualityProfile(nextProfile);
  }, profile);

  await expect
    .poll(
      async () => {
        const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;

        return (
          readNestedString(snapshot, 'activeQualityProfile') ??
          readNestedString(snapshot, 'qualityProfiles.current') ??
          readNestedString(snapshot, 'qualityProfile')
        );
      },
      {
        timeout: 10_000,
        intervals: [100, 200, 400, 800],
        message: `Le profil forcé ${profile} n'est pas devenu actif.`,
      },
    )
    .toBe(profile);
}

async function openOracle(page: Page, testInfo: TestInfo): Promise<void> {
  await gotoOracleRoot(page, testInfo);

  const boot = await waitForOrbAuditHandle(page);
  expect(boot).toMatchObject({
    exists: true,
    hasReadyFn: true,
    hasSnapshotFn: true,
  });

  const readyState = await waitForOrbAuditReady(page);
  expect(readyState.ready).toBe(true);
}

test.describe('Pass 3 — certification des profils qualité forcés', () => {
  test.describe.configure({ mode: 'serial' });

  for (const profile of QUALITY_PROFILES) {
    test(`force le profil ${profile} via __ORB_AUDIT__.setQualityProfile`, async ({ page }, testInfo) => {
      await openOracle(page, testInfo);
      await forceQualityProfile(page, profile);

      const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;

      const activeQualityProfile =
        readNestedString(snapshot, 'activeQualityProfile') ??
        readNestedString(snapshot, 'qualityProfiles.current') ??
        readNestedString(snapshot, 'qualityProfile');

      const forcedQualityProfile =
        readNestedString(snapshot, 'forcedQualityProfile') ??
        readNestedString(snapshot, 'qualityProfiles.forced');

      const qualityProfileSource =
        readNestedString(snapshot, 'qualityProfileSource') ??
        readNestedString(snapshot, 'qualityProfiles.source') ??
        'unknown';

      expect(activeQualityProfile).toBe(profile);
      expect(forcedQualityProfile).toBe(profile);
      expect(['forced', 'auto-detected', 'runtime-budget', 'fallback', 'unknown']).toContain(
        qualityProfileSource,
      );

      expect(readNestedString(snapshot, 'renderMode')).not.toBeNull();
      expect(readNestedString(snapshot, 'deviceClass') ?? readNestedString(snapshot, 'qualityProfiles.deviceClass')).not.toBeNull();

      await testInfo.attach(`quality-profile-${profile}.json`, {
        body: JSON.stringify(snapshot, null, 2),
        contentType: 'application/json',
      });
    });
  }
});