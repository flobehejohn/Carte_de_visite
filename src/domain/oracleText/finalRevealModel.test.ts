import { describe, expect, it } from 'vitest';
import { mapToFinalRevealModel } from './finalRevealModel';

describe('FinalRevealModel (Sprint 1.1) - Contrat P0', () => {
  it('conserve les données utiles issues du payload brut et normalise les tableaux', () => {
    const mockPayload = {
      json: {
        chapter: 'TEST',
        quote: 'Rigueur',
        central_tension: 'Tension',
        reversal: 'Retour',
        explanation_long: 'Harmonie',
        citationsUsed: ['Doc 1'],
        author: 'A',
        confidence: 0.9,
      },
    };

    const result = mapToFinalRevealModel(mockPayload);
    expect(result.quote).toBe('Rigueur');
    expect(result.chapter).toBe('TEST');
    expect(result.central_tension).toBe('Tension');
    expect(result.citations).toEqual(['Doc 1']);
    expect(result.confidence).toBe(0.9);
  });

  it('génère un modèle robuste même si le payload est vide', () => {
    const result = mapToFinalRevealModel(undefined);
    expect(result.chapter).toBe('RÉVÉLATION');
    expect(result.citations).toEqual([]);
    expect(result.confidence).toBe(1.0);
  });
});
