import { expect, test } from '@playwright/test';
import {
  expectOracleCanvasSnapshot,
  prepareOracleVrtScenario,
  type VrtQualityProfile,
} from './utils/orbScenario';

const SMOKE_VRT_SCENARIOS: Array<{
  label: string;
  profile: VrtQualityProfile;
  expectedSmokeState: 'premium' | 'simplified' | 'off';
  screenshot: string;
}> = [
  {
    label: 'fumée premium / profil ultra',
    profile: 'ultra',
    expectedSmokeState: 'premium',
    screenshot: 'oracle-smoke-profile-ultra.png',
  },
  {
    label: 'fumée simplifiée / profil medium',
    profile: 'medium',
    expectedSmokeState: 'simplified',
    screenshot: 'oracle-smoke-profile-medium.png',
  },
  {
    label: 'fumée désactivée / profil safe',
    profile: 'safe',
    expectedSmokeState: 'off',
    screenshot: 'oracle-smoke-profile-safe.png',
  },
];

test.describe('VRT — Oracle smoke profiles', () => {
  for (const scenario of SMOKE_VRT_SCENARIOS) {
    test(scenario.label, async ({ page }, testInfo) => {
      test.setTimeout(240_000);

      await page.setViewportSize({ width: 960, height: 540 });

      const snapshot = await prepareOracleVrtScenario(page, testInfo, {
        profile: scenario.profile,
        seed: 777001,
        progress: 0.58,
        renderMode: 'composer-bloom',
        waitMs: 1_000,
      });

      expect(snapshot?.telemetry?.smokePolicyState).toBe(scenario.expectedSmokeState);
      expect(snapshot?.telemetry?.smokeAlphaLayer).toBeGreaterThanOrEqual(0);
      expect(snapshot?.telemetry?.smokeAlphaLayer).toBeLessThanOrEqual(1);
      expect(snapshot?.telemetry?.smokeCompensation).toMatchObject({
        fogDensityMultiplier: expect.any(Number),
        glowIntensityMultiplier: expect.any(Number),
        volumetricBackgroundMultiplier: expect.any(Number),
        additiveAlphaMultiplier: expect.any(Number),
      });

      await testInfo.attach(`${scenario.screenshot}.snapshot.json`, {
        body: JSON.stringify(snapshot, null, 2),
        contentType: 'application/json',
      });

      await expectOracleCanvasSnapshot(page, testInfo, scenario.screenshot, {
        maxDiffPixelRatio: 0.28,
        threshold: 0.55,
        timeoutMs: 120_000,
      });
    });
  }
});

// === PASS 5.0 VISUAL BASELINE START ===

const PASS5_VISUAL_BASELINE_CASES = [
  {
    name: 'desktop-post-pass4-baseline',
    width: 1440,
    height: 1000,
  },
  {
    name: 'mobile-post-pass4-baseline',
    width: 390,
    height: 844,
  },
] as const;

async function pass5InstallDeterministicBrowserGuards(page: any): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.addInitScript(() => {
    const fixedEpoch = 1_700_000_000_000;
    const fixedNowMs = 1_000;

    const seededRandom = (() => {
      let seed = 5050;

      return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };
    })();

    Math.random = seededRandom;
    Date.now = () => fixedEpoch;

    try {
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => fixedNowMs,
      });
    } catch {
      // Browser may reject overriding performance.now.
    }

    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);

    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      return nativeRequestAnimationFrame(() => {
        callback(fixedNowMs);
      });
    };
  });
}

async function pass5WaitForFonts(page: any): Promise<void> {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
}

async function pass5StabilizeDom(page: any): Promise<void> {
  await page.addStyleTag({
    content: `
      *,
      *::before,
      *::after {
        caret-color: transparent !important;
        animation-duration: 0.001s !important;
        animation-delay: 0s !important;
        transition-duration: 0.001s !important;
        transition-delay: 0s !important;
        scroll-behavior: auto !important;
      }

      video,
      svg,
      canvas {
        caret-color: transparent !important;
      }
    `,
  });

  await page.evaluate(() => {
    window.scrollTo(0, 0);

    for (const video of Array.from(document.querySelectorAll('video'))) {
      try {
        video.pause();
        video.currentTime = 0;
      } catch {
        // Non-fatal for VRT.
      }
    }
  });
}

async function pass5WaitForOrbAuditBridge(page: any): Promise<void> {
  await page.waitForFunction(
    async () => {
      const bridge = (window as any).__ORB_AUDIT__;

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
}

async function pass5LockRuntimeWhenAvailable(page: any): Promise<void> {
  await page.evaluate(() => {
    const bridge = (window as any).__ORB_AUDIT__;

    try {
      bridge?.setSeed?.(5050);
    } catch {
      // Optional runtime hook.
    }

    try {
      bridge?.resetScene?.();
    } catch {
      // Optional runtime hook.
    }

    try {
      bridge?.setProgress?.(0.5);
    } catch {
      // Optional runtime hook.
    }

    try {
      bridge?.setRenderMode?.('composer-bloom');
    } catch {
      // Optional runtime hook.
    }
  });
}

test.describe('Pass 5.0 — Visual baseline post-Pass 4', () => {
  test.describe.configure({ mode: 'serial' });

  for (const baselineCase of PASS5_VISUAL_BASELINE_CASES) {
    test(`captures ${baselineCase.name}`, async ({ page }, testInfo) => {
      await pass5InstallDeterministicBrowserGuards(page);

      await page.setViewportSize({
        width: baselineCase.width,
        height: baselineCase.height,
      });

      await page.goto('/', { waitUntil: 'networkidle' });

      await pass5StabilizeDom(page);
      await pass5WaitForFonts(page);
      await pass5WaitForOrbAuditBridge(page);
      await pass5LockRuntimeWhenAvailable(page);

      await page.waitForTimeout(1_000);

      const runtimeSnapshot = await page.evaluate(() => {
        return (window as any).__ORB_AUDIT__?.snapshot?.() ?? null;
      });

      expect(
        runtimeSnapshot,
        'window.__ORB_AUDIT__.snapshot() must be available for Pass 5.0 visual baseline',
      ).toBeTruthy();

      await testInfo.attach('runtime-snapshot', {
        body: Buffer.from(
          JSON.stringify(
            {
              capturedAt: new Date().toISOString(),
              caseName: baselineCase.name,
              viewport: {
                width: baselineCase.width,
                height: baselineCase.height,
              },
              snapshot: runtimeSnapshot,
            },
            null,
            2,
          ),
          'utf8',
        ),
        contentType: 'application/json',
      });

      const screenshot = await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
        scale: 'css',
      });

      await testInfo.attach(`${baselineCase.name}-actual`, {
        body: screenshot,
        contentType: 'image/png',
      });

      expect(screenshot).toMatchSnapshot(`${baselineCase.name}.png`, {
        threshold: 0.25,
        maxDiffPixelRatio: 0.015,
      });
    });
  }
});

// === PASS 5.0 VISUAL BASELINE END ===