import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RitualInput } from '../domain/types';

const geminiGenerateMock = vi.fn();

vi.mock('../lib/geminiClient', () => {
  return {
    geminiGenerate: (...args: unknown[]) => geminiGenerateMock(...args),
  };
});

import { consultOracle } from './zarathustraService';

const ritual: RitualInput = {
  nameOrNickname: 'florian',
  mood: 'curieux',
  format: 'Conseil',
  questionText: 'Que signifie mon nom dans le rite ?',
  weight: '',
  fear: '',
  desire: '',
  sacrifice: '',
  social: '',
  eternity: '',
};

describe('consultOracle', () => {
  beforeEach(() => {
    geminiGenerateMock.mockReset();
  });

  it('returns the canonical oracle JSON payload instead of the envelope text', async () => {
    geminiGenerateMock.mockResolvedValue({
      traceId: 'ui_test',
      mode: 'oracle',
      text: 'message brut a ignorer',
      json: {
        quote:
          'Florian, ton nom repond comme une flamme legere au-dessus du poids.',
        interpretation:
          'Ton nom se change ici en signe de legerete et de depassement. Il ne designe pas une identite close, mais un passage vers une forme plus haute de toi-meme. Zarathoustra t y convoque comme on appelle un pont vers une aurore.',
        keywords: ['legerete', 'depassement', 'aurore'],
        citations: [
          {
            id: '5190',
            text: 'Zarathoustra le danseur, Zarathoustra le leger...',
            part_title: 'QUATRIEME ET DERNIERE PARTIE',
            section_title: 'DE L HOMME SUPERIEUR',
            source: 'zarathoustra',
          },
          {
            id: '3421',
            text: 'L homme est quelque chose qui doit etre surmonte.',
            source: 'zarathoustra',
          },
        ],
        citation_ids: ['5190', '3421'],
        visual_prescription: {
          primary_color: '#ffd700',
          chaos: 0.4,
          fog_density: 0.15,
          shape_archetype: 'spiral',
        },
      },
    });

    const result = await consultOracle(ritual);

    expect(result.quote).toContain('Florian');
    expect(result.interpretation).toContain('depassement');
    expect(result.keywords).toEqual(['legerete', 'depassement', 'aurore']);
    expect(result.sentence.id).toBe('5190');
    expect(result.sentence.text).toContain('Zarathoustra le danseur');
    expect(result.sentence.part_title).toBe('QUATRIEME ET DERNIERE PARTIE');
    expect(result.visualParams?.primary_color).toBe('#ffd700');
  });

  it('fails closed when the oracle payload is missing instead of fabricating a fallback', async () => {
    geminiGenerateMock.mockResolvedValue({
      traceId: 'ui_test',
      mode: 'oracle',
      text: 'Le silence repond...',
      json: null,
    });

    await expect(consultOracle(ritual)).rejects.toThrow(
      'Oracle payload missing in API response.',
    );
  });
});
