import { test, expect } from '@playwright/test';

test.describe('Phase 8 : VRT - Hologramme Typographique (Thème F)', () => {

  test('Garantit l\'intégration parfaite du texte WebGL', async ({ page }) => {
    // On force la progression à 0.5 pour que l'hologramme soit à sa luminosité MAXIMALE
    await page.goto('/?vrtTime=2.5&vrtSeed=oracle-text-01&vrtChaos=0.5&vrtProgress=0.5');

    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 20000 });

    await page.waitForFunction(() => window.__ORB_AUDIT__ && window.__ORB_AUDIT__.ready !== false, { timeout: 15000 });

    // Masquage HTML strict
    await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (c) { c.style.position = 'fixed'; c.style.top = '0'; c.style.left = '0'; c.style.width = '100vw'; c.style.height = '100vh'; c.style.zIndex = '99999'; }
        const style = document.createElement('style');
        style.innerHTML = '* { caret-color: transparent !important; animation: none !important; }';
        document.head.appendChild(style);
    });

    await page.waitForTimeout(2500);

    // Capture de la nouvelle référence
    await expect(canvas).toHaveScreenshot('oracle-3d-hologram.png', {
      maxDiffPixelRatio: 0.15, // Tolérance habituelle pour le bruit des particules
      timeout: 15000
    });
  });

});
