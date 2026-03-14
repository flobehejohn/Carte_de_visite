import { beforeEach, describe, expect, it, vi } from 'vitest';

const geminiGenerateMock = vi.fn();

vi.mock('../lib/geminiClient', () => {
  return {
    geminiGenerate: (...args: unknown[]) => geminiGenerateMock(...args),
  };
});

import {
    buildGuardianGuidanceFromPayload,
    extractGuidanceParts,
    getStepGuidance,
} from './zarathustraService';

const BANNED_GENERIC =
  /acceptable|sans signal de danger|aucun signal de danger|valid\w*|\bok\b|n apporte pas de sens|nom ou prenom simple/i;

describe('guardian guidance service', () => {
  beforeEach(() => {
    geminiGenerateMock.mockReset();
  });

  it('replaces generic guardian microcopy with deterministic two-level guidance', async () => {
    geminiGenerateMock.mockResolvedValue({
      mode: 'guardian',
      json: {
        comment: 'Le prénom "Aurore" est acceptable.',
        isSafe: true,
        confidence: 0.9,
      },
    });

    const result = await getStepGuidance('name', 'Aurore');
    const parts = extractGuidanceParts(result.comment);

    expect(result.isSafe).toBe(true);
    expect(parts.echo).toContain('Aurore');
    expect(parts.subcomment.length).toBeGreaterThan(24);
    expect(result.comment).not.toMatch(BANNED_GENERIC);
  });

  it('uses optional guardian symbolic hints while keeping deterministic rendering', async () => {
    geminiGenerateMock.mockResolvedValue({
      mode: 'guardian',
      json: {
        comment: 'placeholder',
        isSafe: true,
        confidence: 0.82,
        symbolic_focus: 'return',
        movement: 'deepening',
        tone: 'grave',
        rewrite_hint: 'eternity-opens-return',
      },
    });

    const result = await getStepGuidance(
      'eternity',
      'Je veux savoir ce qui revient en moi.',
    );
    const parts = extractGuidanceParts(result.comment);

    expect(result.symbolic_focus).toBe('return');
    expect(result.movement).toBe('deepening');
    expect(result.tone).toBe('grave');
    expect(parts.echo).toMatch(/retour|durée|revient|étern/i);
    expect(parts.subcomment).toMatch(/retour|durée|répétition|recommencé/i);
    expect(result.comment).not.toMatch(BANNED_GENERIC);
  });

  it('keeps a reformulation path when a step is flagged as unsafe', () => {
    const result = buildGuardianGuidanceFromPayload('question', '', {
      isSafe: false,
      confidence: 0.71,
    });

    const parts = extractGuidanceParts(result.comment);

    expect(result.isSafe).toBe(false);
    expect(parts.echo).toMatch(/question|seuil|reformul/i);
    expect(parts.subcomment.length).toBeGreaterThan(12);
    expect(result.comment).not.toMatch(BANNED_GENERIC);
  });
});
