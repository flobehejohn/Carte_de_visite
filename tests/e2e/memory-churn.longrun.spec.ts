import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
  waitForOrbAuditHandle,
  waitForOrbAuditReady,
} from './utils/orbAudit';

interface HeapProbe {
  supported: boolean;
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
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

async function readHeap(page: Page): Promise<HeapProbe> {
  return page.evaluate(() => {
    const memory = (performance as any).memory;

    if (!memory) {
      return {
        supported: false,
        usedJSHeapSize: null,
        totalJSHeapSize: null,
      };
    }

    return {
      supported: true,
      usedJSHeapSize: Number(memory.usedJSHeapSize),
      totalJSHeapSize: Number(memory.totalJSHeapSize),
    };
  });
}

async function resetSceneIfAvailable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const audit = (window as any).__ORB_AUDIT__;

    if (audit && typeof audit.resetScene === 'function') {
      await audit.resetScene();
    }
  });
}

function readNestedNumber(payload: Record<string, unknown>, path: string): number | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

test.describe('Pass 3 — memory churn long-run', () => {
  test.describe.configure({
    mode: 'serial',
    timeout: 90_000,
  });

  test('reste stable après cycles reset/snapshot', async ({ page }, testInfo) => {
    await openOracle(page, testInfo);

    const beforeHeap = await readHeap(page);
    const snapshots: Record<string, unknown>[] = [];

    for (let index = 0; index < 8; index += 1) {
      await resetSceneIfAvailable(page);
      await page.waitForTimeout(500);

      const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;
      snapshots.push(snapshot);

      expect(snapshot).toBeTruthy();
      expect(Object.keys(snapshot).length).toBeGreaterThan(20);
    }

    const afterHeap = await readHeap(page);
    const lastSnapshot = snapshots.at(-1) ?? {};

    const resetCount = readNestedNumber(lastSnapshot, 'counters.reset');
    const reinitCount = readNestedNumber(lastSnapshot, 'counters.reinit');

    if (resetCount !== null) {
      expect(resetCount).toBeGreaterThanOrEqual(0);
    }

    if (reinitCount !== null) {
      expect(reinitCount).toBeGreaterThanOrEqual(0);
      expect(reinitCount).toBeLessThanOrEqual(12);
    }

    if (
      beforeHeap.supported &&
      afterHeap.supported &&
      beforeHeap.usedJSHeapSize !== null &&
      afterHeap.usedJSHeapSize !== null
    ) {
      const growthRatio = afterHeap.usedJSHeapSize / Math.max(beforeHeap.usedJSHeapSize, 1);

      expect(growthRatio).toBeLessThanOrEqual(2.5);
    }

    await testInfo.attach('memory-churn-longrun.json', {
      body: JSON.stringify(
        {
          beforeHeap,
          afterHeap,
          snapshotCount: snapshots.length,
          lastSnapshot,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  });
});