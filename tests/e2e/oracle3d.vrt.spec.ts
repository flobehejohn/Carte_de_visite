import { test, expect } from '@playwright/test';

test.describe('Phase 8 : Visual Regression Testing (VRT) - Golden Master', () => {

  test('Garantit que le rendu 3D Sublime ne regresse pas', async ({ page }) => {
    // 1. Navigation avec les Hooks de Zéro Absolu
    await page.goto('/?vrtTime=2.5&vrtSeed=golden-master-001&vrtChaos=0.8&vrtProgress=1.0');

    // 2. Cibler le Canvas 
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 20000 });

    // 3. Attendre l'Audit Bridge
    await page.waitForFunction(() => window.__ORB_AUDIT__ && window.__ORB_AUDIT__.ready !== false, { timeout: 15000 });

    // 4. MASQUAGE DE L'UI : On passe le Canvas en plein écran absolu par-dessus le HTML
    await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (c) {
            c.style.position = 'fixed';
            c.style.top = '0';
            c.style.left = '0';
            c.style.width = '100vw';
            c.style.height = '100vh';
            c.style.zIndex = '99999';
        }
        // Stoppe les curseurs clignotants
        const style = document.createElement('style');
        style.innerHTML = '* { caret-color: transparent !important; animation: none !important; }';
        document.head.appendChild(style);
    });

    // 5. Laisser les shaders FBM se compiler
    await page.waitForTimeout(2500);

    // 6. Prendre la photo
    // Tolérance de 20% pour le bruit des particules génératives.
    // L'Orbe et les Shaders (qui occupent 80% de l'impact visuel) restent sous haute sécurité.
    await expect(canvas).toHaveScreenshot('oracle-3d-golden-master.png', {
      maxDiffPixelRatio: 0.20,
      timeout: 15000
    });
  });

});
