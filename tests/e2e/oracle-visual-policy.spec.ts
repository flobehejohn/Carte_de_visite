import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

type VisualProfile = 'ultra' | 'medium' | 'safe';
type ExpectedBloomState = 'cinematic' | 'balanced' | 'off';

type SnapshotLike = {
  activeQualityProfile?: unknown;
  forcedQualityProfile?: unknown;
  qualityProfile?: unknown;
  qualityProfiles?: {
    current?: unknown;
    forced?: unknown;
  };
  bloomPolicy?: {
    state?: unknown;
    strength?: unknown;
    radius?: unknown;
    threshold?: unknown;
  };
  iridescencePolicy?: {
    state?: unknown;
  };
  telemetry?: {
    activeQualityProfile?: unknown;
    bloomPolicyState?: unknown;
    iridescencePolicyState?: unknown;
    bloomStrength?: unknown;
    bloomRadius?: unknown;
    bloomThreshold?: unknown;
  };
  [key: string]: unknown;
};

function readNestedString(payload: Record<string, unknown>, path: string): string | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function activeProfileOf(snapshot: SnapshotLike): string | null {
  return (
    readNestedString(snapshot as Record<string, unknown>, 'telemetry.activeQualityProfile') ??
    readNestedString(snapshot as Record<string, unknown>, 'activeQualityProfile') ??
    readNestedString(snapshot as Record<string, unknown>, 'qualityProfiles.current') ??
    readNestedString(snapshot as Record<string, unknown>, 'qualityProfile')
  );
}

function expectRichSnapshot(snapshot: SnapshotLike): void {
  expect(snapshot).toBeTruthy();
  expect(Object.keys(snapshot).length).toBeGreaterThanOrEqual(25);
  expect(JSON.stringify(snapshot).length).toBeGreaterThan(1_000);

  expect(snapshot.bloomPolicy).toBeTruthy();
  expect(snapshot.iridescencePolicy).toBeTruthy();
  expect(snapshot.telemetry).toBeTruthy();

  expect(typeof snapshot.telemetry?.bloomStrength).toBe('number');
  expect(typeof snapshot.telemetry?.bloomRadius).toBe('number');
  expect(typeof snapshot.telemetry?.bloomThreshold).toBe('number');

  expect(snapshot.telemetry?.bloomPolicyState).toBe(snapshot.bloomPolicy?.state);
  expect(snapshot.telemetry?.iridescencePolicyState).toBe(snapshot.iridescencePolicy?.state);

  expect(snapshot.telemetry?.bloomStrength).toBe(snapshot.bloomPolicy?.strength);
  expect(snapshot.telemetry?.bloomRadius).toBe(snapshot.bloomPolicy?.radius);
  expect(snapshot.telemetry?.bloomThreshold).toBe(snapshot.bloomPolicy?.threshold);
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

async function applyQualityProfile(
  page: Page,
  profile: VisualProfile,
  expectedBloomState: ExpectedBloomState,
): Promise<SnapshotLike> {
  await page.evaluate(async ({ nextProfile }) => {
    const audit = (window as any).__ORB_AUDIT__;

    if (!audit || typeof audit.setQualityProfile !== 'function') {
      throw new Error('__ORB_AUDIT__.setQualityProfile indisponible.');
    }

    audit.setSeed?.(`visual-policy-${nextProfile}`);
    audit.setProgress?.(0.72);

    await audit.setQualityProfile(nextProfile);
  }, { nextProfile: profile });

  await expect
    .poll(
      async () => {
        const snapshot = (await readSerializableSnapshot(page)) as SnapshotLike;

        return {
          active: activeProfileOf(snapshot),
          bloomState: snapshot.bloomPolicy?.state ?? null,
          iridescenceState: snapshot.iridescencePolicy?.state ?? null,
          telemetryBloomState: snapshot.telemetry?.bloomPolicyState ?? null,
          telemetryIridescenceState: snapshot.telemetry?.iridescencePolicyState ?? null,
          richEnough: Object.keys(snapshot).length >= 25 && JSON.stringify(snapshot).length > 1_000,
        };
      },
      {
        timeout: 20_000,
        intervals: [100, 200, 400, 800, 1_200],
        message: `Le profil ${profile} doit exposer bloomPolicy.state=${expectedBloomState}.`,
      },
    )
    .toMatchObject({
      active: profile,
      bloomState: expectedBloomState,
      telemetryBloomState: expectedBloomState,
      richEnough: true,
    });

  return (await readSerializableSnapshot(page)) as SnapshotLike;
}

test.describe('Pass 5.D — governed visual policies E2E', () => {
  test('quality profiles drive bloom and iridescence policies without critical console errors', async ({
    page,
  }, testInfo) => {
    const criticalConsole: string[] = [];

    page.on('console', (message) => {
      if (message.type() !== 'error') {
        return;
      }

      const text = message.text();

      if (/favicon|react devtools/i.test(text)) {
        return;
      }

      criticalConsole.push(`${message.type()}: ${text}`);
    });

    page.on('pageerror', (error) => {
      criticalConsole.push(`pageerror: ${error.name}: ${error.message}`);
    });

    await openOracle(page, testInfo);

    const ultra = await applyQualityProfile(page, 'ultra', 'cinematic');
    expectRichSnapshot(ultra);
    expect(activeProfileOf(ultra)).toBe('ultra');
    expect(ultra.bloomPolicy?.state).toBe('cinematic');
    expect(['expressive', 'subtle']).toContain(ultra.iridescencePolicy?.state);

    const medium = await applyQualityProfile(page, 'medium', 'balanced');
    expectRichSnapshot(medium);
    expect(activeProfileOf(medium)).toBe('medium');
    expect(medium.bloomPolicy?.state).toBe('balanced');

    const safe = await applyQualityProfile(page, 'safe', 'off');
    expectRichSnapshot(safe);
    expect(activeProfileOf(safe)).toBe('safe');
    expect(safe.bloomPolicy?.state).toBe('off');
    expect(safe.iridescencePolicy?.state).toBe('off');

    await testInfo.attach('pass-5d-final-safe-snapshot.json', {
      body: JSON.stringify(safe, null, 2),
      contentType: 'application/json',
    });

    expect(criticalConsole).toEqual([]);
  });
});