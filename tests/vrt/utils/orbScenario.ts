import { expect, type Page, type TestInfo } from '@playwright/test';
import {
  gotoOracleRoot,
  readSerializableSnapshot,
} from '../../e2e/utils/orbAudit';
import {
  forceQualityProfile,
  readNestedString,
  type QualityProfileName,
} from '../../e2e/utils/orbProfile';

export type VrtQualityProfile = QualityProfileName;

export interface OracleVrtScenario {
  profile: VrtQualityProfile;
  seed: number;
  progress?: number;
  renderMode?: 'direct' | 'composer-bloom';
  waitMs?: number;
}

export interface OracleVrtCaptureOptions {
  maxDiffPixelRatio: number;
  threshold?: number;
  timeoutMs?: number;
}

interface VrtBootState {
  exists: boolean;
  ready: boolean;
  hasReadyFn: boolean;
  hasSnapshotFn: boolean;
}

function readNestedBoolean(payload: Record<string, unknown>, path: string): boolean | null {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, payload);

  return typeof value === 'boolean' ? value : null;
}

async function readVrtBootState(page: Page): Promise<VrtBootState> {
  try {
    return await page.evaluate(async () => {
      const audit = (window as any).__ORB_AUDIT__;
      const hasReadyFn = typeof audit?.ready === 'function';
      const hasSnapshotFn = typeof audit?.snapshot === 'function';

      let ready = false;
      if (hasReadyFn) {
        const value = audit.ready();
        ready = Boolean(value instanceof Promise ? await value : value);
      }

      return {
        exists: Boolean(audit),
        ready,
        hasReadyFn,
        hasSnapshotFn,
      };
    });
  } catch {
    return {
      exists: false,
      ready: false,
      hasReadyFn: false,
      hasSnapshotFn: false,
    };
  }
}

async function openOracleForVrt(page: Page, testInfo: TestInfo): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await gotoOracleRoot(page, testInfo);

      await expect
        .poll(() => readVrtBootState(page), {
          timeout: 45_000,
          intervals: [250, 500, 1_000, 2_000],
          message: 'Le bridge __ORB_AUDIT__ VRT ne démarre pas correctement.',
        })
        .toMatchObject({
          exists: true,
          hasReadyFn: true,
          hasSnapshotFn: true,
        });

      await expect
        .poll(() => readVrtBootState(page), {
          timeout: 60_000,
          intervals: [250, 500, 1_000, 2_000],
          message: 'Le bridge __ORB_AUDIT__ VRT ne devient pas ready.',
        })
        .toMatchObject({
          ready: true,
        });

      return;
    } catch (error) {
      lastError = error;

      await page
        .reload({
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        })
        .catch(() => undefined);

      await page.waitForTimeout(1_000);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Ouverture VRT Oracle échouée.');
}

async function waitForSteadyRuntime(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const snapshot = (await readSerializableSnapshot(page)) as Record<string, unknown>;

        return {
          isWarmup: readNestedBoolean(snapshot, 'timingDiagnostics.isWarmup'),
          warmupPhase: readNestedString(snapshot, 'timingDiagnostics.warmupPhase'),
        };
      },
      {
        timeout: 60_000,
        intervals: [250, 500, 1_000, 2_000],
        message: 'Le runtime VRT n’atteint pas un état steady.',
      },
    )
    .toEqual({
      isWarmup: false,
      warmupPhase: 'steady',
    });
}

export async function prepareOracleVrtScenario(
  page: Page,
  testInfo: TestInfo,
  scenario: OracleVrtScenario,
): Promise<Record<string, unknown>> {
  await openOracleForVrt(page, testInfo);

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        caret-color: transparent !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }

      html,
      body {
        cursor: default !important;
        overflow: hidden !important;
        background: #000 !important;
      }
    `,
  });

  await page.evaluate(async ({ seed, renderMode }) => {
    const audit = (window as any).__ORB_AUDIT__;

    if (!audit) {
      throw new Error('__ORB_AUDIT__ indisponible.');
    }

    if (typeof audit.setSeed === 'function') {
      await audit.setSeed(seed);
    }

    if (renderMode && typeof audit.setRenderMode === 'function') {
      await audit.setRenderMode(renderMode);
    }
  }, scenario);

  await forceQualityProfile(page, scenario.profile);

  await page.evaluate(async ({ progress }) => {
    const audit = (window as any).__ORB_AUDIT__;

    if (!audit) {
      throw new Error('__ORB_AUDIT__ indisponible après setQualityProfile.');
    }

    if (typeof progress === 'number' && typeof audit.setProgress === 'function') {
      await audit.setProgress(progress);
    }
  }, scenario);

  await waitForSteadyRuntime(page);

  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await (document as any).fonts?.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });

  await page.waitForTimeout(scenario.waitMs ?? 1_000);

  return (await readSerializableSnapshot(page)) as Record<string, unknown>;
}

export async function expectOracleCanvasSnapshot(
  page: Page,
  testInfo: TestInfo,
  screenshotName: string,
  options: OracleVrtCaptureOptions,
): Promise<void> {
  const canvas = page.locator('canvas').first();

  await expect(canvas, 'Le canvas WebGL Oracle doit être visible avant capture VRT.').toBeVisible({
    timeout: 30_000,
  });

  const box = await canvas.boundingBox();

  if (!box) {
    throw new Error('Impossible de calculer la bounding box du canvas Oracle.');
  }

  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  const clip = {
    x: Math.max(0, Math.floor(box.x)),
    y: Math.max(0, Math.floor(box.y)),
    width: Math.max(1, Math.floor(box.width)),
    height: Math.max(1, Math.floor(box.height)),
  };

  const screenshot = await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    clip,
    scale: 'css',
    timeout: options.timeoutMs ?? 120_000,
  });

  expect(screenshot.byteLength, 'La capture VRT composite ne doit pas être vide.').toBeGreaterThan(1_000);

  await testInfo.attach(`${screenshotName}.clip.json`, {
    body: JSON.stringify(clip, null, 2),
    contentType: 'application/json',
  });

  await testInfo.attach(screenshotName, {
    body: screenshot,
    contentType: 'image/png',
  });

  expect(screenshot).toMatchSnapshot(screenshotName, {
    maxDiffPixelRatio: options.maxDiffPixelRatio,
    threshold: options.threshold ?? 0.5,
  });
}