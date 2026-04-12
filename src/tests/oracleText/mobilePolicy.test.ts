import { describe, expect, it } from 'vitest';
import { distributeSurfaces } from '../../domain/oracleText/surfacePolicy';
import { buildSemanticTypography } from '../../scene/contracts/semanticTypography';

describe('Phase 6 - Mobile-First et Réduction Typographique', () => {
  const mockPayload = {
    json: {
      quote: "L'univers n'a pas de centre, mais tu en es la conscience.",
      chapter: 'ÉVEIL',
      keywords: ['Conscience', 'Infini'],
    },
    composition: { imperative: 'Regarde en toi.' },
  };

  it("M1: En mode Desktop (isMobile=false), la citation et l'impératif vont en 3D", () => {
    const doc = buildSemanticTypography(mockPayload);
    const dist = distributeSurfaces(doc, false);

    expect(dist.webglWorld).toHaveProperty('quote');
    expect(dist.htmlOverlay).not.toHaveProperty('quote');
    expect(dist.webglHud).toHaveProperty('imperative');
    expect(dist.htmlOverlay).not.toHaveProperty('imperative');
  });

  it("M2: En mode Mobile (isMobile=true), la citation et l'impératif sont rapatriés en HTML net", () => {
    const doc = buildSemanticTypography(mockPayload);
    const dist = distributeSurfaces(doc, true);

    expect(dist.htmlOverlay).toHaveProperty('quote');
    expect(dist.webglWorld).not.toHaveProperty('quote');
    expect(dist.htmlOverlay).toHaveProperty('imperative');
    expect(dist.webglHud).not.toHaveProperty('imperative');
  });

  it('M3: Même sur Mobile, les mots-clés et le chapitre restent en 3D', () => {
    const doc = buildSemanticTypography(mockPayload);
    const dist = distributeSurfaces(doc, true);

    expect(dist.webglHud).toHaveProperty('chapter');
    expect(dist.webglWorld).toHaveProperty('keywords');
  });
});
