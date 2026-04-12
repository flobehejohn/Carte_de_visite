import { test } from '@playwright/test';
import {
  assertFinalReveal,
  installPhase8ApiMocks,
  playRitual,
} from './_helpers/oracle-phase8';

const viewports = [
  { name: 'Desktop', width: 1920, height: 1080 },
  { name: 'Mobile', width: 375, height: 812 },
];

for (const viewport of viewports) {
  test.describe(`Audit Déterministe - Le Rituel en 10 Étapes (${viewport.name})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`Garantit la révélation Phase 8 sur ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const runContext = { count: 1 };

      await installPhase8ApiMocks(page, runContext);
      await page.goto('/?e2e=phase8', { waitUntil: 'domcontentloaded' });

      await playRitual(page, 'Audit');
      await assertFinalReveal(page, 1);
    });
  });
}
