import { expect, test } from '@playwright/test';
import {
  assertFinalReveal,
  installPhase8ApiMocks,
  playRitual,
} from './_helpers/oracle-phase8';

test.describe('Articulation Texte / 3D', () => {
  test("Affiche les sources et l'interprétation dans la bonne surface HTML", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const runContext = { count: 1 };

    await installPhase8ApiMocks(page, runContext);
    await page.goto('/?e2e=phase8', { waitUntil: 'domcontentloaded' });

    await playRitual(page, 'Artic');
    await assertFinalReveal(page, 1);

    await expect(page.getByTestId('reveal-prose')).toBeVisible();
    await expect(page.getByTestId('reveal-sources')).toBeVisible();

    // Preuve 1 : On survole explicitement la première citation
    await page.getByTestId('reveal-citation-0').hover({ force: true });
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return (window as any).__ORACLE_LAST_FOCUS__?.target ?? 'none';
        });
      })
      .toBe('citation');

    // Preuve 2 : On survole la prose pour vérifier que le bridge suit bien
    await page.getByTestId('reveal-prose').hover({ force: true });
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          return (window as any).__ORACLE_LAST_FOCUS__?.target ?? 'none';
        });
      })
      .toBe('prose');
  });
});
