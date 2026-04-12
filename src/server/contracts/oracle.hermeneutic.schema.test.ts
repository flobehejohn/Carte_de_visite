import { describe, expect, it } from 'vitest';

import { OracleHermeneuticV2Schema } from './oracleContracts.js';

describe('OracleHermeneuticV2Schema', () => {
  it('accepts a valid hermeneutic payload', () => {
    const payload = {
      quote: 'Florian avance comme une flamme sobre dans le vent.',
      opening_image: 'Une flamme mince se tient au bord du seuil.',
      central_tension: 'Le nom cherche une forme plus haute que lui-meme.',
      reversal: 'Ce qui semblait simple devient un appel a se depasser.',
      imperative: 'Porte ce nom comme une discipline de legerete.',
      return_axis: 'Reviens a la flamme quand le poids revient.',
      keywords: ['flamme', 'seuil', 'legerete', 'retour'],
      anchors: [
        {
          citation_id: '5190',
          role: 'anchor',
          motif: 'flamme dansante',
          claim: 'Le nom prend figure de legerete active.',
        },
        {
          citation_id: '3421',
          role: 'turn',
          motif: 'depassement',
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

    const parsed = OracleHermeneuticV2Schema.safeParse(payload);

    expect(parsed.success).toBe(true);
  });

  it('rejects a payload with empty anchors', () => {
    const payload = {
      quote: 'Une parole tient encore.',
      opening_image: 'Une image persiste.',
      central_tension: 'Une tension demeure.',
      reversal: 'Le sens se retourne.',
      imperative: 'Avance.',
      return_axis: 'Reviens.',
      keywords: ['retour', 'seuil', 'forme', 'elan'],
      anchors: [],
      visual_prescription: {
        primary_color: '#112233',
        chaos: 0.2,
        fog_density: 0.1,
        shape_archetype: 'torusKnot',
      },
      confidence: 0.5,
    };

    const parsed = OracleHermeneuticV2Schema.safeParse(payload);

    expect(parsed.success).toBe(false);
  });
});
