import { describe, expect, it } from 'vitest';
import { evaluateStrictInvariants } from '../../../src/server/gemini/evaluate-strict-invariants.js';

type EvalInput = Parameters<typeof evaluateStrictInvariants>[0];
type EvalOptions = Parameters<typeof evaluateStrictInvariants>[1];

const STRICT_OPTIONS = {
  minCitations: 2,
  lockedSource: 'zarathoustra',
  structuredOutputsOn: true,
} satisfies EvalOptions;

describe('evaluateStrictInvariants', () => {
  it('accepts Option B when rawJsonError exists but final state is valid', () => {
    const input = {
      mode: 'guardian',
      finalJson: {
        comment: 'ok',
        isSafe: true,
        citations: [],
      },
      finalJsonError: null,
      schemaValid: true,
      structuredUsed: true,
      raw: {
        structured: false,
        fallback: false,
        repairApplied: false,
        reason: 'INVALID_JSON_FROM_LLM',
        parseError: 'Unexpected token } in JSON at position 17',
        rawJsonError: 'INVALID_JSON_FROM_LLM',
        retryCount: 2,
      },
      citationsUsed: [
        { id: '1', source: 'zarathoustra' },
        { id: '2', source: 'zarathoustra' },
      ],
      knowledge: { corpusLoaded: true },
    } as EvalInput;

    const violations = evaluateStrictInvariants(input, STRICT_OPTIONS);

    // Preuve noire sur blanc de l’Option B
    expect(input.raw.rawJsonError).not.toBeNull();
    expect(input.finalJsonError).toBeNull();
    expect(input.structuredUsed).toBe(true);

    // Les invariants stricts doivent être évalués sur l’état final normalisé
    expect(violations).toEqual([]);

    const ok = input.finalJsonError === null && violations.length === 0;
    expect(ok).toBe(true);
  });

  it('raises JSON_ERROR when finalJsonError is not null', () => {
    const input = {
      mode: 'guardian',
      finalJson: null,
      finalJsonError: 'SCHEMA_VALIDATION_FAILED',
      schemaValid: false,
      structuredUsed: false,
      raw: {
        structured: true,
        fallback: false,
        repairApplied: false,
        reason: 'FINAL_SCHEMA_INVALID',
        parseError: null,
        rawJsonError: null,
        retryCount: 0,
      },
      citationsUsed: [
        { id: '1', source: 'zarathoustra' },
        { id: '2', source: 'zarathoustra' },
      ],
      knowledge: { corpusLoaded: true },
    } as EvalInput;

    const violations = evaluateStrictInvariants(input, STRICT_OPTIONS);

    expect(violations.some((v) => v.code === 'JSON_ERROR')).toBe(true);
    expect(violations.some((v) => v.code === 'STRUCTURED_NOT_USED')).toBe(true);
  });
});
