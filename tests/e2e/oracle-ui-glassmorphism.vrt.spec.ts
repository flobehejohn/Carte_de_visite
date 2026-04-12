import { test, expect } from '@playwright/test';

test.describe('Phase 9 : VRT - Harmonie UI & WebGL (Thème F)', () => {

  test('Garantit la Passe d\'Armes : La modale HTML s\'intègre sur la 3D sans caviardage', async ({ page }) => {
    // progress=1.0 : L'hologramme 3D doit disparaître, la modale HTML doit être opaque et le fond 3D visible derrière le flou
    await page.goto('/?vrtTime=2.5&vrtSeed=ui-harmony-01&vrtChaos=0.6&vrtProgress=1.0');

    // On attend que la 3D soit prête
    const canvas = page.locator('canvas').first();
    await canvas.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(() => window.__ORB_AUDIT__ && window.__ORB_AUDIT__.ready !== false, { timeout: 15000 });

    // On attend que la modale React soit apparue (Transition CSS)
    await page.waitForTimeout(1000);

    // Gèle les curseurs pour une capture propre
    await page.evaluate(() => {
        const style = document.createElement('style');
        style.innerHTML = '* { caret-color: transparent !important; animation: none !important; }';
        document.head.appendChild(style);
    });

    // On prend une photo de la PAGE ENTIÈRE (HTML + Canvas 3D)
    await expect(page).toHaveScreenshot('oracle-glassmorphism-harmony.png', {
      maxDiffPixelRatio: 0.15,
      timeout: 15000
    });
  });

});
