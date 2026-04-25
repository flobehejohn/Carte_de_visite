import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

interface FpsSample {
  measuredFps: number;
  frameCount: number;
  durationMs: number;
}

const FPS_SCENARIOS = [
  {
    label: 'Desktop — FPS minimal en steady state',
    device: 'desktop',
    contextOptions: {
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    minFps: 24,
  },
  {
    label: 'Mobile emulated — FPS minimal en steady state',
    device: 'mobile',
    contextOptions: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    minFps: 18,
  },
] as const;

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

async function measureFps(page: Page, durationMs: number): Promise<FpsSample> {
  return page.evaluate(async (duration) => {
    const start = performance.now();
    let frames = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        frames += 1;

        if (performance.now() - start >= duration) {
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    const elapsed = performance.now() - start;

    return {
      measuredFps: (frames * 1000) / elapsed,
      frameCount: frames,
      durationMs: elapsed,
    };
  }, durationMs);
}

test.describe('Pass 3 — budget FPS runtime', () => {
  test.describe.configure({ mode: 'serial' });

  for (const scenario of FPS_SCENARIOS) {
    test(scenario.label, async ({ browser }, testInfo) => {
      const context = await browser.newContext(scenario.contextOptions);
      const page = await context.newPage();

      try {
        await openOracle(page, testInfo);

        const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;
        const fps = await measureFps(page, 2_500);

        expect(fps.frameCount).toBeGreaterThan(0);
        expect(fps.measuredFps).toBeGreaterThanOrEqual(scenario.minFps);

        await testInfo.attach(`fps-budget-${scenario.device}.json`, {
          body: JSON.stringify(
            {
              scenario,
              fps,
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
  }
});