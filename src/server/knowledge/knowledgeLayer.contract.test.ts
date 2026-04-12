import { beforeEach, describe, expect, it } from 'vitest';
import { handleGeminiRequest } from '../../../api/gemini.js';
import { OracleRequestSchema } from '../contracts/oracle.schemas.js';
import { retrieveZaraCitations } from './retriever.js';

function buildOracleRetrievalQuery(prompt: string, nameOrNickname: string): string {
  return JSON.stringify({
    ritual: { nameOrNickname },
    prompt,
    climate: null,
  });
}

function makeOracleHermeneuticPayload(citationIds: string[]) {
  return {
    quote: 'Test quote',
    opening_image: 'Une lueur se leve dans la brume.',
    central_tension: 'Le seuil demande une forme plus haute.',
    reversal: 'Ce qui semblait simple devient orientation.',
    imperative: 'Traverse sans lourdeur.',
    return_axis: 'Reviens au seuil quand le sens se retire.',
    keywords: ['seuil', 'brume', 'retour', 'forme'],
    anchors: [
      {
        citation_id: citationIds[0],
        role: 'anchor',
        motif: 'lueur',
        claim: 'Le commencement se donne comme apparition.',
      },
      {
        citation_id: citationIds[1],
        role: 'turn',
        motif: 'passage',
        claim: 'Le rite incline deja vers la transformation.',
      },
    ],
    confidence: 0.5,
    visual_prescription: {
      primary_color: '#88aaff',
      chaos: 0.3,
      fog_density: 0.2,
      shape_archetype: 'torusKnot',
    },
  };
}

const makeStructuredCall = (citationIds: string[]) => async () => {
  const payload = makeOracleHermeneuticPayload(citationIds);

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
    jsonCandidate: payload,
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

  it('returns citationsUsed (>=2), locks corpus, and exposes hermeneutic plus composition with audit json', async () => {
    const prompt = 'Rituel: je franchis le seuil et je cite Zarathoustra.';
    const nameOrNickname = 'test';
    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt,
      ritual: { nameOrNickname },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });
    const citationIds = retrieveZaraCitations(
      buildOracleRetrievalQuery(prompt, nameOrNickname),
      { k: 6 },
    )
      .slice(0, 2)
      .map((citation) => String(citation.id));

    const res = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: makeStructuredCall(citationIds) as any,
      callGeminiImpl: stubRawCall as any,
    });

    const out = res.response;

    expect(out.citationsUsed.length).toBeGreaterThanOrEqual(2);
    expect(out.citationsUsed.every((c) => c.source === 'zarathoustra')).toBe(
      true,
    );
    expect(out.citationsUsed.every((c) => String(c.id).length > 0)).toBe(true);
    expect(out.json).toBeTruthy();
    expect(out.hermeneutic).toBeTruthy();
    expect(out.composition?.prose.length).toBeGreaterThan(40);
    expect(out.composition?.motifs.length).toBeGreaterThanOrEqual(2);
    expect(out.hermeneutic?.anchors.length).toBeGreaterThanOrEqual(2);
    expect(
      out.hermeneutic?.anchors.every((anchor) =>
        out.citationsUsed.some((citation) => String(citation.id) === anchor.citation_id),
      ),
    ).toBe(true);
  });

  it('keeps citation ids stable for the same request (within a run)', async () => {
    const prompt = 'Rituel: je franchis le seuil et je cite Zarathoustra.';
    const nameOrNickname = 'test';
    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt,
      ritual: { nameOrNickname },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });
    const citationIds = retrieveZaraCitations(
      buildOracleRetrievalQuery(prompt, nameOrNickname),
      { k: 6 },
    )
      .slice(0, 2)
      .map((citation) => String(citation.id));

    const a = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: makeStructuredCall(citationIds) as any,
      callGeminiImpl: stubRawCall as any,
    });

    const b = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: makeStructuredCall(citationIds) as any,
      callGeminiImpl: stubRawCall as any,
    });

    const aIds = a.response.citationsUsed.slice(0, 2).map((c) => String(c.id));
    const bIds = b.response.citationsUsed.slice(0, 2).map((c) => String(c.id));

    expect(aIds).toEqual(bIds);
  });
});
