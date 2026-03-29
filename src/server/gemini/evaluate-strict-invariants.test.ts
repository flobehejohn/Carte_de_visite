import { describe, expect, it } from 'vitest';
import { evaluateStrictInvariants } from '../../../src/server/gemini/evaluate-strict-invariants.js';

type EvalInput = Parameters<typeof evaluateStrictInvariants>[0];
type EvalOptions = Parameters<typeof evaluateStrictInvariants>[1];

const STRICT_OPTIONS = {
  minCitations: 2,
  lockedSource: 'zarathoustra',
  structuredOutputsOn: true,
} satisfies EvalOptions;

function makeGuardianInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
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
    guidance: {
      echo: '« Jeanne » ouvre un seuil sobre ; tu peux entrer sans te justifier.',
      subcomment:
        'Ici, le nom cesse d etre une preuve et devient une premiere apparition.',
    },
    composition: null,
    ...overrides,
  };
}

function makeOracleInput(overrides: Partial<EvalInput> = {}): EvalInput {
  return {
    mode: 'oracle',
    finalJson: {
      quote: 'Une flamme sobre tient le seuil.',
      anchors: [
        {
          citation_id: '1',
          role: 'anchor',
          motif: 'flamme',
          claim: 'Le rite prend appui sur une apparition.',
        },
        {
          citation_id: '2',
          role: 'tension',
          motif: 'poids',
          claim: 'Le passage hesite encore sous sa charge.',
        },
        {
          citation_id: '3',
          role: 'turn',
          motif: 'retour',
          claim: 'Le retournement rend le passage praticable.',
        },
      ],
    },
    finalJsonError: null,
    schemaValid: true,
    structuredUsed: true,
    raw: {
      structured: true,
      fallback: false,
      repairApplied: false,
      reason: 'NATIVE_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
    },
    citationsUsed: [
      { id: '1', source: 'zarathoustra' },
      { id: '2', source: 'zarathoustra' },
      { id: '3', source: 'zarathoustra' },
    ],
    knowledge: { corpusLoaded: true },
    guidance: null,
    composition: {
      prose:
        'Une flamme sobre tient le seuil. Le passage porte encore son poids. Le retour inverse la pesanteur. Reviens a cet axe quand la forme vacille.',
    },
    ...overrides,
  };
}

describe('evaluateStrictInvariants', () => {
  it('accepts Option B guardian state when rawJsonError exists but final guidance is valid', () => {
    const input = makeGuardianInput();

    const violations = evaluateStrictInvariants(input, STRICT_OPTIONS);

    expect(input.raw.rawJsonError).not.toBeNull();
    expect(input.finalJsonError).toBeNull();
    expect(input.structuredUsed).toBe(true);
    expect(violations).toEqual([]);
  });

  it('raises JSON_ERROR when finalJsonError is not null', () => {
    const input = makeGuardianInput({
      finalJson: null,
      finalJsonError: 'SCHEMA_VALIDATION_FAILED',
      schemaValid: false,
      structuredUsed: false,
      guidance: null,
      raw: {
        structured: true,
        fallback: false,
        repairApplied: false,
        reason: 'FINAL_SCHEMA_INVALID',
        parseError: null,
        rawJsonError: null,
        retryCount: 0,
      },
    });

    const violations = evaluateStrictInvariants(input, STRICT_OPTIONS);

    expect(violations.some((v) => v.code === 'JSON_ERROR')).toBe(true);
    expect(violations.some((v) => v.code === 'STRUCTURED_NOT_USED')).toBe(true);
  });

  it('raises GUIDANCE_MISSING when guardian final state has no governed guidance', () => {
    const violations = evaluateStrictInvariants(
      makeGuardianInput({ guidance: null }),
      STRICT_OPTIONS,
    );

    expect(violations.map((v) => v.code)).toContain('GUIDANCE_MISSING');
  });

  it('raises GUIDANCE_EMPTY_ECHO when guardian echo is blank', () => {
    const violations = evaluateStrictInvariants(
      makeGuardianInput({
        guidance: {
          echo: '   ',
          subcomment: 'Le seuil garde encore un sens ferme.',
        },
      }),
      STRICT_OPTIONS,
    );

    expect(violations.map((v) => v.code)).toContain('GUIDANCE_EMPTY_ECHO');
  });

  it('raises GUIDANCE_EMPTY_SUBCOMMENT when guardian subcomment is blank', () => {
    const violations = evaluateStrictInvariants(
      makeGuardianInput({
        guidance: {
          echo: '« Jeanne » ouvre un seuil sobre.',
          subcomment: '   ',
        },
      }),
      STRICT_OPTIONS,
    );

    expect(violations.map((v) => v.code)).toContain(
      'GUIDANCE_EMPTY_SUBCOMMENT',
    );
  });

  it('raises ANCHOR_ROLE_COVERAGE_MISSING when oracle roles do not cover anchor, tension and turn', () => {
    const violations = evaluateStrictInvariants(
      makeOracleInput({
        finalJson: {
          quote: 'Une flamme sobre tient le seuil.',
          anchors: [
            {
              citation_id: '1',
              role: 'anchor',
              motif: 'flamme',
              claim: 'Le rite prend appui sur une apparition.',
            },
            {
              citation_id: '2',
              role: 'turn',
              motif: 'retour',
              claim: 'Le retournement rend le passage praticable.',
            },
          ],
        },
      }),
      STRICT_OPTIONS,
    );

    expect(violations.map((v) => v.code)).toContain(
      'ANCHOR_ROLE_COVERAGE_MISSING',
    );
  });

  it('raises COMPOSITION_EMPTY when oracle composition prose is blank', () => {
    const violations = evaluateStrictInvariants(
      makeOracleInput({
        composition: {
          prose: '   ',
        },
      }),
      STRICT_OPTIONS,
    );

    expect(violations.map((v) => v.code)).toContain('COMPOSITION_EMPTY');
  });

  it('keeps missing hermeneutic and too-few-anchors covered upstream by JSON_* invariants instead of duplicating extra violations', () => {
    const violations = evaluateStrictInvariants(
      makeOracleInput({
        finalJson: null,
        finalJsonError: 'SCHEMA_VALIDATION_FAILED',
        schemaValid: false,
        composition: null,
      }),
      STRICT_OPTIONS,
    );

    const codes = violations.map((v) => v.code);
    expect(codes).toContain('JSON_EMPTY');
    expect(codes).toContain('JSON_ERROR');
    expect(codes).not.toContain('ANCHOR_ROLE_COVERAGE_MISSING');
    expect(codes).not.toContain('COMPOSITION_EMPTY');
  });
});
