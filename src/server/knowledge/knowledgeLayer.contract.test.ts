import { beforeEach, describe, expect, it } from 'vitest';
import { handleGeminiRequest } from '../../../api/gemini.js';
import { OracleRequestSchema } from '../contracts/oracle.schemas.js';

const stubStructuredCall = async () => {
  const payload = {
    quote: 'Test quote',
    interpretation: 'Test interpretation',
    keywords: ['test'],
    citation_ids: ['1', '2'],
    delta: {},
    confidence: 0.5,
    visual_prescription: {
      primary_color: '#88aaff',
      chaos: 0.3,
      fog_density: 0.2,
      shape_archetype: 'torusKnot',
    },
  };

  return {
    ok: true,
    status: 200,
    raw: {
      structured: true,
      fallback: false,
      repairApplied: false,
      reason: 'NATIVE_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
    },
    text: JSON.stringify(payload),
    ms: 5,
  };
};

const stubRawCall = async () => {
  const payload = {
    quote: 'Test quote',
    interpretation: 'Test interpretation',
    keywords: ['test'],
    citation_ids: ['1', '2'],
    delta: {},
    confidence: 0.5,
    visual_prescription: {
      primary_color: '#88aaff',
      chaos: 0.3,
      fog_density: 0.2,
      shape_archetype: 'torusKnot',
    },
  };

  return {
    ok: true,
    status: 200,
    raw: {
      structured: false,
      fallback: false,
      repairApplied: false,
      reason: 'RAW_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
    },
    text: JSON.stringify(payload),
    ms: 5,
  };
};

describe('knowledge layer contract', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';
    process.env.GEMINI_FAIL_CLOSED_STRICT = '1';
  });

  it('returns citationsUsed (>=2), locks corpus, and includes citations in json', async () => {
    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: 'Rituel: je franchis le seuil et je cite Zarathoustra.',
      ritual: { nameOrNickname: 'test' },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });

    const res = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: stubStructuredCall as any,
      callGeminiImpl: stubRawCall as any,
    });

    const out = res.response;

    expect(out.citationsUsed.length).toBeGreaterThanOrEqual(2);
    expect(out.citationsUsed.every((c) => c.source === 'zarathoustra')).toBe(
      true,
    );
    expect(out.citationsUsed.every((c) => String(c.id).length > 0)).toBe(true);

    const json = out.json as any;
    expect(json).toBeTruthy();
    expect(Array.isArray(json.citations)).toBe(true);
    expect(json.citations.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps citation ids stable for the same request (within a run)', async () => {
    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: 'Rituel: je franchis le seuil et je cite Zarathoustra.',
      ritual: { nameOrNickname: 'test' },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });

    const a = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: stubStructuredCall as any,
      callGeminiImpl: stubRawCall as any,
    });

    const b = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: stubStructuredCall as any,
      callGeminiImpl: stubRawCall as any,
    });

    const aIds = a.response.citationsUsed.slice(0, 2).map((c) => String(c.id));
    const bIds = b.response.citationsUsed.slice(0, 2).map((c) => String(c.id));

    expect(aIds).toEqual(bIds);
  });
});
