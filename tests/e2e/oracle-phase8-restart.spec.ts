import { expect, test } from '@playwright/test';
import {
    assertFinalReveal,
    installPhase8ApiMocks,
    playRitual
} from './_helpers/oracle-phase8';

test.describe('Preuve P0 - Phase 8 Restart Implacable', () => {
  test('Le bouton Reset purge le rituel et garantit un Run 2 totalement propre', async ({
    page,
  }) => {
    test.setTimeout(240000);
    const runContext = { count: 1 };

    await installPhase8ApiMocks(page, runContext);
    await page.goto('/?e2e=phase8', { waitUntil: 'domcontentloaded' });

    await playRitual(page, 'RUN1');
    await assertFinalReveal(page, 1);

    await page.getByTestId('btn-restart').click({ force: true });

    await expect(page.getByTestId('reveal-panel')).toBeHidden();
    await expect(page.getByTestId('step-title')).toBeVisible();

    await page.waitForTimeout(500);

    await playRitual(page, 'RUN2');
    await assertFinalReveal(page, 2);

    await expect(page.getByTestId('reveal-prose')).not.toContainText('RUN 1');
  });
});
