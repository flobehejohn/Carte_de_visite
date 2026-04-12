import { describe, expect, it } from 'vitest';

import {
  collectOracleAnchorRoles,
  validateOracleHermeneuticAnchors,
} from './oracle-hermeneutic.js';

const citation = (id: string) => ({
  id,
  source: 'zarathoustra',
  title: 'Z',
  quote: '...',
  score: 0.9,
});

function makeHermeneutic() {
  return {
    quote: 'Florian avance comme une flamme sobre dans le vent.',
    opening_image: 'Une flamme mince se tient au bord du seuil.',
    central_tension: 'Le nom cherche une forme plus haute que lui-même.',
    reversal: 'Ce qui semblait simple devient un appel à se dépasser.',
    imperative: 'Porte ce nom comme une discipline de légèreté.',
    return_axis: 'Reviens à la flamme quand le poids revient.',
    keywords: ['flamme', 'seuil', 'retour', 'légèreté'],
    anchors: [
      {
        citation_id: '5190',
        role: 'anchor' as const,
        motif: 'flamme dansante',
        claim: 'Le nom prend figure de légèreté active.',
      },
      {
        citation_id: '3421',
        role: 'turn' as const,
        motif: 'dépassement',
        claim: 'Le rite transforme le nom en passage.',
      },
    ],
    visual_prescription: {
      primary_color: '#ffd700',
      chaos: 0.32,
      fog_density: 0.14,
      shape_archetype: 'spiral',
    },
    confidence: 0.73,
  };
}

describe('validateOracleHermeneuticAnchors', () => {
  it('accepts a payload when every anchor points to a resolved citation', () => {
    const result = validateOracleHermeneuticAnchors(makeHermeneutic(), [
      citation('5190'),
      citation('3421'),
      citation('28'),
    ]);

    expect(result.ok).toBe(true);
  });

  it('rejects a payload when an anchor citation_id is absent from citationsUsed', () => {
    const result = validateOracleHermeneuticAnchors(makeHermeneutic(), [
      citation('5190'),
      citation('28'),
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missingCitationIds).toEqual(['3421']);
  });

  it('keeps role coverage informative but not strictly blocking for now', () => {
    const result = validateOracleHermeneuticAnchors(makeHermeneutic(), [
      citation('5190'),
      citation('3421'),
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missingRoles).toEqual(['tension']);
  });

  it('normalizes anchor role aliases through the shared helper', () => {
    const hermeneutic = makeHermeneutic() as any;

    hermeneutic.anchors = [
      {
        citation_id: '5190',
        role: 'opening',
        motif: 'flamme dansante',
        claim: 'Le nom prend figure de légèreté active.',
      },
      {
        citation_id: '3421',
        role: 'pivot',
        motif: 'dépassement',
        claim: 'Le rite transforme le nom en passage.',
      },
      {
        citation_id: '28',
        role: 'tension',
        motif: 'poids',
        claim: 'Le poids demande une forme plus haute.',
      },
    ];

    const roles = collectOracleAnchorRoles(hermeneutic);

    expect(Array.from(roles).sort()).toEqual(['anchor', 'tension', 'turn']);
  });
});
