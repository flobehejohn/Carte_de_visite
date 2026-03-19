import { describe, expect, it } from 'vitest';

import {
  normalizeOracleAnchorRole,
  normalizeOracleHermeneuticRoles,
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
});

describe('normalizeOracleAnchorRole', () => {
  it('canonicalizes the explicitly allowed oracle anchor role synonyms', () => {
    expect(normalizeOracleAnchorRole('fondation')).toBe('anchor');
    expect(normalizeOracleAnchorRole('fondateur')).toBe('anchor');
    expect(normalizeOracleAnchorRole('avertissement')).toBe('tension');
    expect(normalizeOracleAnchorRole('observateur')).toBe('tension');
    expect(normalizeOracleAnchorRole('vision')).toBe('turn');
    expect(normalizeOracleAnchorRole('guide')).toBe('turn');
  });

  it('keeps unknown roles invalid instead of widening the contract', () => {
    expect(normalizeOracleAnchorRole('presage')).toBeNull();
  });
});

describe('normalizeOracleHermeneuticRoles', () => {
  it('rewrites the observed live roles to canonical oracle roles without touching citation ids', () => {
    const normalized = normalizeOracleHermeneuticRoles({
      ...makeHermeneutic(),
      anchors: [
        {
          citation_id: '5190',
          role: 'fondateur',
          motif: 'flamme dansante',
          claim: 'Le nom prend figure de légèreté active.',
        },
        {
          citation_id: '3421',
          role: 'observateur',
          motif: 'dépassement',
          claim: 'Le rite transforme le nom en passage.',
        },
        {
          citation_id: '28',
          role: 'guide',
          motif: 'poids',
          claim: 'Le passage exige une forme plus haute.',
        },
      ],
    }) as ReturnType<typeof makeHermeneutic>;

    expect(normalized.anchors.map((anchor) => anchor.role)).toEqual([
      'anchor',
      'tension',
      'turn',
    ]);
    expect(normalized.anchors.map((anchor) => anchor.citation_id)).toEqual([
      '5190',
      '3421',
      '28',
    ]);
  });
});
