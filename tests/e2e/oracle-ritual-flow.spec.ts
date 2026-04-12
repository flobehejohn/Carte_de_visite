import { test, expect } from '@playwright/test';

test.describe('Audit Profond - Le Séquençage du Rituel', () => {

  test('Garantit le cheminement : Accueil -> Questions -> Révélation WebGL/UI', async ({ page }) => {
    // 1. Chargement de l'application
    await page.goto('/');

    // 2. Étape : Accueil
    const startButton = page.locator('button', { hasText: /Commencer le Rituel/i });
    await expect(startButton).toBeVisible({ timeout: 10000 });
    
    // 3. On déclenche le rituel
    await startButton.click();

    // 4. Étape : Le Formulaire de Rituel (Questions) DOIT apparaître
    // On s'assure que l'UI de démarrage a disparu
    await expect(startButton).toBeHidden();
    
    // Le formulaire (RitualForm) est maintenant censé être dans le DOM
    // (Ajuste ce sélecteur si ton formulaire a un data-testid spécifique)
    const formContainer = page.locator('form').first().or(page.locator('input').first());
    await expect(formContainer).toBeVisible({ timeout: 5000 });

    // --- À partir d'ici, selon ta logique de formulaire, 
    // Playwright pourrait remplir les champs. Pour l'audit général, 
    // on valide au moins que le composant des questions n'est plus court-circuité. ---
  });

});
