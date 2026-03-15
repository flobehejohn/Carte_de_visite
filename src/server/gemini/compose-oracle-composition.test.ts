import { describe, expect, it } from 'vitest';
import { composeOracleComposition } from './compose-oracle-composition.js';

function makeHermeneutic() {
  return {
    quote: 'Florian avance comme une flamme sobre dans le vent.',
    opening_image: 'Une flamme mince veille au bord du seuil.',
    central_tension: 'Le nom cherche une forme plus haute que lui meme.',
    reversal: 'Ce qui semblait simple devient une discipline de passage.',
    imperative: 'Porte ce nom sans lourdeur.',
    return_axis: 'Reviens a la flamme quand le poids revient.',
    keywords: ['flamme', 'seuil', 'retour', 'legerete'],
    anchors: [
      {
        citation_id: '101',
        role: 'anchor' as const,
        motif: 'flamme',
        claim: 'Le commencement demande une clarte vigilante.',
      },
      {
        citation_id: '202',
        role: 'tension' as const,
        motif: 'hauteur',
        claim: 'La hauteur oblige le nom a quitter la simple etiquette.',
      },
      {
        citation_id: '303',
        role: 'turn' as const,
        motif: 'retour',
        claim: 'Le retour n annule pas le passage, il le scelle.',
      },
    ],
    confidence: 0.88,
    visual_prescription: {
      primary_color: '#ffd700',
      chaos: 0.32,
      fog_density: 0.14,
      shape_archetype: 'spiral',
    },
  };
}

function makeMotifs() {
  return [
    {
      citation_id: '101',
      role: 'anchor' as const,
      motif: 'flamme',
      claim: 'Le commencement demande une clarte vigilante.',
      part_title: 'PREMIERE PARTIE',
      section_title: 'LE PROLOGUE DE ZARATHOUSTRA',
    },
    {
      citation_id: '202',
      role: 'tension' as const,
      motif: 'hauteur',
      claim: 'La hauteur oblige le nom a quitter la simple etiquette.',
      section_title: 'DE LA VICTOIRE SUR SOI-MEME',
    },
    {
      citation_id: '303',
      role: 'turn' as const,
      motif: 'retour',
      claim: 'Le retour n annule pas le passage, il le scelle.',
      section_title: 'LE RETOUR',
    },
  ];
}

function countSentences(value: string): number {
  return value
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0).length;
}

describe('composeOracleComposition', () => {
  it('builds a deterministic oracle composition with non-empty blocks', () => {
    const hermeneutic = makeHermeneutic();
    const motifs = makeMotifs();

    const first = composeOracleComposition(hermeneutic, motifs);
    const second = composeOracleComposition(hermeneutic, motifs);

    expect(first).toEqual(second);
    expect(first.prose.length).toBeGreaterThan(40);
    expect(countSentences(first.prose)).toBeLessThanOrEqual(4);
    expect(first.blocks.opening.length).toBeGreaterThan(10);
    expect(first.blocks.tension.length).toBeGreaterThan(10);
    expect(first.blocks.turn.length).toBeGreaterThan(10);
    expect(first.blocks.imperative.length).toBeGreaterThan(10);
  });
});
