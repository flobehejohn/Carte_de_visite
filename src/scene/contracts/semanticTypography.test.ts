import { describe, expect, it } from 'vitest';
import {
  buildSemanticTypography,
  resolveDirectives,
  TextBlock,
} from './semanticTypography';

describe('Gouvernance Typographique (Phase 1) - Moteur de Poids Dramaturgique', () => {
  it('B1: Un payload en erreur génère un bloc P0 (system_alert) avec des directives absolues et bloquantes', () => {
    const errorPayload = { finalJsonError: 'STRICT_INVARIANT_VIOLATION' };
    const doc = buildSemanticTypography(errorPayload);

    expect(doc.system_alert.weight).toBe('P0');
    expect(doc.system_alert.content).toBe('STRICT_INVARIANT_VIOLATION');
    expect(doc.system_alert.surfacePolicy).toBe('hybrid');
    expect(doc.system_alert.directives.contrast).toBe('absolute');
    expect(doc.system_alert.directives.mobilePriority).toBe('force_top');
  });

  it('B2: Le cœur rituel (P1) est affecté à une grande taille (lg) et une animation cinématique', () => {
    const mockLLM = { hermeneutic: { quote: "L'abîme te regarde." } };
    const doc = buildSemanticTypography(mockLLM);

    expect(doc.quote.weight).toBe('P1');
    expect(doc.quote.directives.size).toBe('lg');
    expect(doc.quote.directives.animation).toBe('reveal_cinematic');
  });

  it("B3: La preuve d'audit (P4) est assignée au contraste le plus faible et masquée sur mobile", () => {
    const mockLLM = { citationsUsed: [42, 43] };
    const doc = buildSemanticTypography(mockLLM);

    expect(doc.citations.weight).toBe('P4');
    expect(doc.citations.directives.contrast).toBe('lowest');
    expect(doc.citations.directives.mobilePriority).toBe('hide');
    expect(doc.citations.directives.size).toBe('xs');
  });

  it("B4: Le résolveur garantit qu'aucun texte secondaire ne peut noyer un texte important", () => {
    const p1_directives = resolveDirectives('P1');
    const p3_directives = resolveDirectives('P3');

    expect(p1_directives.size).not.toBe(p3_directives.size);
    // P1 (lg) surpasse P3 (sm)
    expect(p1_directives.size).toBe('lg');
    expect(p3_directives.size).toBe('sm');
  });
});

describe('Gouvernance Typographique (Phase 5) - Statut Narratif et Diégèse', () => {
  const doc = buildSemanticTypography({
    json: {
      quote: 'La réponse est ailleurs.',
      chapter: 'ORIGINES',
      keywords: ['Secret', 'Vérité'],
    },
  });

  const allBlocks: TextBlock[] = Object.values(doc);

  it('F1: Les textes Extradiégétiques (documentaires) ne doivent JAMAIS être injectés profondément en 3D (3d_world)', () => {
    const extradiegeticBlocks = allBlocks.filter(
      (b) => b.diegesisMode === 'extradiegetic',
    );

    // Règle essentielle : Plus c'est documentaire, moins c'est dans la scène
    for (const block of extradiegeticBlocks) {
      expect(block.surfacePolicy).not.toBe('3d_world');
      // Ils doivent vivre en périphérie (HTML ou HUD frontal max)
      expect([
        'html_overlay',
        'html_drawer',
        'hidden',
        'hybrid',
        '3d_hud',
      ]).toContain(block.surfacePolicy);
    }
  });

  it('F2: Les textes Diégétiques (monde visible) doivent être rendus en 3D ou en HUD, pas relégués dans les tiroirs HTML', () => {
    const diegeticBlocks = allBlocks.filter(
      (b) => b.diegesisMode === 'diegetic',
    );

    for (const block of diegeticBlocks) {
      expect(block.surfacePolicy).not.toBe('html_drawer');
      expect(block.surfacePolicy).not.toBe('hidden');
      expect(['3d_world', '3d_hud']).toContain(block.surfacePolicy);
    }
  });

  it("F3: La Citation Héroïque (Intradiégétique) est bien traitée comme la voix de l'Oracle", () => {
    expect(doc.quote.diegesisMode).toBe('intradiegetic');
    // Le statut Intradiégétique autorise l'intégration profonde (3d_world)
    expect(doc.quote.surfacePolicy).toBe('3d_world');
  });

  it("F4: L'appareil critique (Citations, Explications, Confiance) est strictement Extradiégétique", () => {
    expect(doc.citations.diegesisMode).toBe('extradiegetic');
    expect(doc.explanation_long.diegesisMode).toBe('extradiegetic');
    expect(doc.confidence.diegesisMode).toBe('extradiegetic');
  });
});
