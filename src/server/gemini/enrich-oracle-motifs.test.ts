import { describe, expect, it } from 'vitest';
import { enrichOracleCompositionMotifs } from './enrich-oracle-motifs.js';

function makeHermeneutic() {
  return {
    quote: 'Florian avance comme une flamme sobre.',
    opening_image: 'Une flamme veille sur le seuil.',
    central_tension: 'Le nom cherche encore sa hauteur.',
    reversal: 'Le passage incline deja vers le depassement.',
    imperative: 'Traverse sans lourdeur.',
    return_axis: 'Reviens a la flamme quand le poids revient.',
    keywords: ['flamme', 'seuil', 'retour', 'depassement'],
    anchors: [
      {
        citation_id: '101',
        role: 'anchor' as const,
        motif: 'flamme',
        claim: 'Le commencement tient dans une clarte en veille.',
      },
      {
        citation_id: '202',
        role: 'turn' as const,
        motif: 'retour',
        claim: 'Le rite transforme le nom en passage.',
      },
    ],
    confidence: 0.82,
    visual_prescription: {
      primary_color: '#ffd700',
      chaos: 0.28,
      fog_density: 0.14,
      shape_archetype: 'spiral',
    },
  };
}

describe('enrichOracleCompositionMotifs', () => {
  it('enriches motifs with citation metadata when citations are present', () => {
    const result = enrichOracleCompositionMotifs(makeHermeneutic(), [
      {
        id: '101',
        source: 'zarathoustra',
        text: 'Premier texte',
        part_title: 'PREMIERE PARTIE',
        section_title: 'LE PROLOGUE DE ZARATHOUSTRA',
      },
      {
        id: '202',
        source: 'zarathoustra',
        text: 'Second texte',
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.motifs).toEqual([
      {
        citation_id: '101',
        role: 'anchor',
        motif: 'flamme',
        claim: 'Le commencement tient dans une clarte en veille.',
        part_title: 'PREMIERE PARTIE',
        section_title: 'LE PROLOGUE DE ZARATHOUSTRA',
      },
      {
        citation_id: '202',
        role: 'turn',
        motif: 'retour',
        claim: 'Le rite transforme le nom en passage.',
      },
    ]);
  });

  it('fails when a referenced citation is missing at enrichment time', () => {
    const result = enrichOracleCompositionMotifs(makeHermeneutic(), [
      {
        id: '101',
        source: 'zarathoustra',
        text: 'Premier texte',
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.missingCitationIds).toEqual(['202']);
  });
});
