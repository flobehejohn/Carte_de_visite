import { expect, test, type Page } from '@playwright/test';

type QualityProfile = 'ultra' | 'safe';

function registerCriticalErrorCapture(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;

    const text = message.text();

    // Les erreurs console doivent rester exceptionnelles. On garde une
    // fonction dédiée pour permettre un filtrage explicite si un bruit
    // navigateur non critique apparaît plus tard.
    errors.push(`console.error: ${text}`);
  });

  return errors;
}

async function waitForAuditReady(page: Page) {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const bridge = (window as any).__ORB_AUDIT__;
          return Boolean(bridge?.ready?.());
        }),
      {
        timeout: 30_000,
        message: '__ORB_AUDIT__ should become ready after lazy 3D mount',
      },
    )
    .toBe(true);
}

async function readSnapshot(page: Page) {
  return page.evaluate(() => {
    const bridge = (window as any).__ORB_AUDIT__;
    if (!bridge?.snapshot) {
      throw new Error('__ORB_AUDIT__.snapshot missing');
    }

    return bridge.snapshot();
  });
}

async function setQualityProfile(page: Page, profile: QualityProfile) {
  await page.evaluate((nextProfile) => {
    const bridge = (window as any).__ORB_AUDIT__;
    if (!bridge?.setQualityProfile) {
      throw new Error('__ORB_AUDIT__.setQualityProfile missing');
    }

    bridge.setQualityProfile(nextProfile);
  }, profile);

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const snapshot = (window as any).__ORB_AUDIT__?.snapshot?.();
          return (
            snapshot?.qualityProfiles?.current ??
            snapshot?.telemetry?.activeQualityProfile ??
            null
          );
        }),
      {
        timeout: 15_000,
        message: `quality profile should become ${profile}`,
      },
    )
    .toBe(profile);
}

test('first paint stays usable while 3D scene is lazy loaded', async ({ page }) => {
  const errors = registerCriticalErrorCapture(page);

  await page.addInitScript(() => {
    (window as any).__ORB_DEBUG_VISIBLE_PROBE__ = false;
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(
    page.getByRole('heading', { name: /Qui ose éveiller Zarathoustra/i }),
  ).toBeVisible({ timeout: 10_000 });

  await expect(page.getByPlaceholder(/Ton nom/i)).toBeVisible({
    timeout: 10_000,
  });

  const fallback = page.getByTestId('oracle-3d-scene-fallback');

  if ((await fallback.count()) > 0) {
    await expect(fallback.first()).toHaveAttribute('aria-hidden', 'true');
  }

  await waitForAuditReady(page);

  const initialSnapshot = await readSnapshot(page);

  expect(initialSnapshot?.telemetry, 'snapshot.telemetry exists').toBeTruthy();
  expect(
    initialSnapshot?.qualityProfiles,
    'snapshot.qualityProfiles exists',
  ).toBeTruthy();
  expect(
    initialSnapshot?.telemetry?.smokePolicyState,
    'snapshot.telemetry.smokePolicyState exists',
  ).toBeTruthy();

  expect(
    initialSnapshot?.sceneStats?.hasRenderableContent,
    'scene has renderable content after lazy mount',
  ).toBe(true);

  await setQualityProfile(page, 'safe');

  const safeSnapshot = await readSnapshot(page);
  expect(safeSnapshot?.telemetry?.smokePolicyState).toBe('off');

  await setQualityProfile(page, 'ultra');

  const ultraSnapshot = await readSnapshot(page);
  expect(ultraSnapshot?.telemetry?.smokePolicyState).toBe('premium');

  expect(errors).toEqual([]);
});
