import { expect, test } from '@playwright/test';

test.describe('Audit Diégétique - Articulation Texte 3D / HTML', () => {
  test("Garantit le transfert de la Citation vers WebGL et l'affichage du HUD HTML", async ({
    page,
  }) => {
    test.setTimeout(180000);

    // MOCK API ALIGNÉ SUR LE CONTRAT FRONTEND STRICT
    await page.route('**/api/**', async (route) => {
      const requestData = route.request().postData() || '';
      const isFinalOracle =
        requestData.includes('"mode":"oracle"') ||
        requestData.includes('oracle');

      if (isFinalOracle) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            json: {
              // L'UI ATTEND CELA STRICTEMENT
              chapter: 'LIVRE DES TESTS',
              quote: "La machine s'incline devant la rigueur de l'Architecte.",
              interpretation:
                "L'harmonie entre le DOM et le Canvas est absolue.",
              author: 'Zarathoustra (Simulé)',
              keywords: ['Certitude', 'Contrôle', 'Absolu'],
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            isSafe: true,
            json: { comment: 'Le seuil est franchi.' },
          }),
        });
      }
    });

    await page.goto('/?isUnderTest=true');

    const startBtn = page
      .locator('button')
      .filter({ hasText: /Initier|Commencer/i })
      .first();
    const textInput = page.locator('input[type="text"]').first();

    await expect(startBtn.or(textInput)).toBeVisible({ timeout: 45000 });

    if (await startBtn.isVisible()) {
      await startBtn.click({ force: true });
    }

    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(500);

      const currentTextInput = page.locator('input[type="text"]').last();
      const choiceBtns = page.locator('button').filter({
        hasNotText:
          /Continuer|Invoquer|Confirmer|Initier|Commencer|Fermer|Réessayer|Recommencer|Révéler|Découvrir|Terminer|Zarathoustra/i,
      });

      await expect(currentTextInput.or(choiceBtns.last())).toBeVisible({
        timeout: 15000,
      });

      if (await currentTextInput.isVisible()) {
        await currentTextInput.fill(`Réponse à l'étape ${i}`);
        await currentTextInput.press('Enter');
      } else {
        await choiceBtns.last().click({ force: true });
        const confirmerBtn = page
          .locator('button')
          .filter({ hasText: /Confirmer/i })
          .last();
        await expect(confirmerBtn).toBeVisible({ timeout: 5000 });
        await confirmerBtn.click({ force: true });
      }

      if (i < 10) {
        const continueBtn = page
          .locator('button')
          .filter({ hasText: /Continuer/i })
          .last();
        await expect(continueBtn).toBeVisible({ timeout: 15000 });
        await continueBtn.click({ force: true });
      } else {
        const finalBtn = page
          .locator('button')
          .filter({
            hasText: /Invoquer|Révéler|Découvrir|Terminer|Zarathoustra/i,
          })
          .last();

        try {
          await expect(finalBtn).toBeVisible({ timeout: 5000 });
          await finalBtn.click({ force: true });
        } catch (error) {
          // Bypass : auto-transition
        }
      }
    }

    // Preuve comportementale : L'orchestrateur 3D prend le relai
    await page.waitForFunction(
      () => {
        const state = window['__ORACLE_3D_STATE__'];
        return state && state.isRevealing === true && state.progress > 0.1;
      },
      { timeout: 30000 },
    );

    const finalState = await page.evaluate(() => window['__ORACLE_3D_STATE__']);
    expect(finalState.lastQuoteReceived).toBe(
      "La machine s'incline devant la rigueur de l'Architecte.",
    );

    const quoteInHtml = page.locator(
      'text="La machine s\'incline devant la rigueur de l\'Architecte."',
    );
    await expect(quoteInHtml).toHaveCount(0);
  });
});
