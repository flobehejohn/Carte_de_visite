import { describe, expect, it } from 'vitest';
import { distributeSurfaces } from '../../domain/oracleText/surfacePolicy';
import { buildSemanticTypography } from '../../scene/contracts/semanticTypography';

describe('Phase 2 - Architecture Hybride des Surfaces (surfacePolicy)', () => {
  it("C1: Route la citation (P1) vers le WebGL World et l'explication longue (P3) vers le HTML Overlay", () => {
    const mockPayload = {
      quote: "L'abîme te regarde.",
      composition: { prose: 'Ceci est une longue explication analytique.' },
    };

    const doc = buildSemanticTypography(mockPayload);
    const distribution = distributeSurfaces(doc);

    // 3D pour sentir
    expect(distribution.webglWorld).toHaveProperty('quote');
    expect(distribution.webglWorld['quote'].content).toBe(
      "L'abîme te regarde.",
    );

    // HTML pour comprendre
    expect(distribution.htmlOverlay).toHaveProperty('explanation_long');
    expect(distribution.htmlOverlay['explanation_long'].content).toBe(
      'Ceci est une longue explication analytique.',
    );

    // Isolation absolue : La 3D ne doit pas polluer le HTML
    expect(distribution.htmlOverlay).not.toHaveProperty('quote');
    expect(distribution.webglWorld).not.toHaveProperty('explanation_long');
  });

  it('C2: Route les citations et métadonnées vers le HTML Drawer (Citations pour croire)', () => {
    const mockPayload = { citationsUsed: [1, 2], confidence: 0.99 };

    const doc = buildSemanticTypography(mockPayload);
    const distribution = distributeSurfaces(doc);

    expect(distribution.htmlDrawer).toHaveProperty('citations');
    expect(distribution.htmlDrawer).toHaveProperty('confidence');

    // Le drawer ne doit rien afficher d'autre
    expect(distribution.htmlDrawer).not.toHaveProperty('quote');
  });

  it('C3: Gère la politique hybride en dupliquant intelligemment le bloc (ex: Imperative)', () => {
    const mockPayload = { composition: { imperative: 'Avance sans peur.' } };

    const doc = buildSemanticTypography(mockPayload);
    // On force l'imperative en hybride pour le test si ce n'est pas le défaut
    doc.imperative.surfacePolicy = 'hybrid';

    const distribution = distributeSurfaces(doc);

    // L'imperatif doit exister aux deux endroits
    expect(distribution.htmlOverlay).toHaveProperty('imperative');
    expect(distribution.webglHud).toHaveProperty('imperative');
  });
});
