import { test, expect } from '@playwright/test';

test.describe('Audit Déterministe - Le Rituel en 10 Étapes', () => {

  test('Garantit que le rituel traverse les 10 strates avant la révélation Glassmorphism', async ({ page }) => {
    test.setTimeout(300000); 

    // --- LE BOUCLIER DÉTERMINISTE ---
    await page.route('**/api/**', async (route) => {
      const requestData = route.request().postData() || "";
      const isFinalOracle = requestData.includes('"mode":"oracle"') || requestData.includes('oracle');

      if (isFinalOracle) {
        await new Promise(r => setTimeout(r, 1000)); 
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            json: {
              chapter: "LIVRE DES TESTS",
              quote: "La machine s'incline devant la rigueur de l'Architecte.",
              interpretation: "Analyse déterministe validée. La matrice est stable.",
              author: "Zarathoustra (Simulé)",
              keywords: ["Certitude", "Contrôle", "Absolu"]
            }
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            json: {
              comment: "Le seuil est franchi. L'harmonie opère.",
              isSafe: true,
              confidence: 0.99
            }
          })
        });
      }
    });

    await page.goto('/?isUnderTest=true');

    // DECLENCHEMENT
    const startBtn = page.locator('button').filter({ hasText: /Initier|Commencer/i }).first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await startBtn.click();
    }

    // LA BOUCLE DES 10 ÉTAPES
    for (let i = 1; i <= 10; i++) {
      console.log(`--- Étape ${i} ---`);

      const textInput = page.locator('input[type="text"]');
      const choiceBtns = page.locator('button').filter({ hasNotText: /(Continuer le voyage|Invoquer Zarathoustra|Confirmer|Initier|Commencer|Réessayer l’invocation|Recommencer le rituel)/i });

      await expect(textInput.or(choiceBtns.first())).toBeVisible({ timeout: 15000 });

      if (await textInput.isVisible()) {
        await textInput.fill(`Réponse à l'étape ${i}`);
        await textInput.press('Enter'); 
      } else {
        await choiceBtns.first().click(); 
        
        const confirmerBtn = page.locator('button', { hasText: /Confirmer/i });
        await expect(confirmerBtn).toBeVisible({ timeout: 5000 });
        await confirmerBtn.click();
      }

      // TRANSITION
      if (i < 10) {
        const continueBtn = page.locator('button', { hasText: /Continuer le voyage/i });
        await expect(continueBtn).toBeVisible({ timeout: 30000 }); 
        await continueBtn.click();
        await expect(continueBtn).toBeHidden({ timeout: 5000 });
      } else {
        const invokeBtn = page.locator('button', { hasText: /Invoquer Zarathoustra/i });
        await expect(invokeBtn).toBeVisible({ timeout: 30000 });
        await invokeBtn.click();
      }
    }

    // 5. RÉVÉLATION FINALE (Validation sur la présence de la Parole Oracle)
    // On ne cherche plus un data-testid, on cherche la preuve visuelle absolue que l'UI a changé
    const revelationProof = page.locator('text="Parole oracle"').or(page.locator('button', { hasText: /Fermer le Cercle/i }));
    
    // Le test passera au vert éclatant ici !
    await expect(revelationProof.first()).toBeVisible({ timeout: 15000 });
  });

});
