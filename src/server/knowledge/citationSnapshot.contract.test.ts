import { beforeEach, describe, expect, it } from 'vitest';

import { handleGeminiRequest } from '../../../api/gemini.js';
import { OracleRequestSchema } from '../contracts/oracle.schemas.js';
import type { Citation } from '../contracts/oracle.types.js';

type HandlerDeps = NonNullable<Parameters<typeof handleGeminiRequest>[1]>;
type StructuredImpl = NonNullable<HandlerDeps['callGeminiStructuredImpl']>;
type RawImpl = NonNullable<HandlerDeps['callGeminiImpl']>;

type CitationSnapshot = {
  id: string;
  source: string;
  section_title: string;
};

const stubStructuredCall: StructuredImpl = async (args) => {
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
    text: JSON.stringify(payload),
    jsonCandidate: payload,
    raw: {
      traceId: args.traceId,
      model: args.model,
      structured: true,
      fallback: false,
      repairApplied: false,
      reason: 'NATIVE_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
      parseStage: 'direct',
      preview: null,
      parsedPreview: null,
      error: null,
    },
    ms: 5,
  };
};

const stubRawCall: RawImpl = async (args) => {
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
    text: JSON.stringify(payload),
    raw: {
      traceId: args.traceId,
      model: args.model,
      structured: false,
    },
    ms: 5,
  };
};

function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    return na - nb;
  }
  return a.localeCompare(b);
}

function toCitationSnapshot(citations: Citation[]): CitationSnapshot[] {
  return citations
    .map((citation) => {
      const passthrough = citation as Record<string, unknown>;
      const sectionTitle =
        typeof passthrough.section_title === 'string'
          ? passthrough.section_title
          : '';

      return {
        id: String(citation.id ?? ''),
        source: typeof citation.source === 'string' ? citation.source : '',
        section_title: sectionTitle,
      };
    })
    .sort((a, b) => {
      const byId = compareIds(a.id, b.id);
      if (byId !== 0) return byId;
      const bySource = a.source.localeCompare(b.source);
      if (bySource !== 0) return bySource;
      return a.section_title.localeCompare(b.section_title);
    });
}

describe('citation snapshot contract', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';
    process.env.GEMINI_FAIL_CLOSED_STRICT = '1';
  });

  it('same request -> same citation snapshot within a run', async () => {
    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: 'Rituel: je franchis le seuil et je cite Zarathoustra.',
      ritual: { nameOrNickname: 'snapshot' },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });

    const a = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: stubStructuredCall,
      callGeminiImpl: stubRawCall,
    });

    const b = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: stubStructuredCall,
      callGeminiImpl: stubRawCall,
    });

    const snapshotA = toCitationSnapshot(a.response.citationsUsed);
    const snapshotB = toCitationSnapshot(b.response.citationsUsed);

    expect(snapshotA.length).toBeGreaterThanOrEqual(2);
    expect(snapshotA).toEqual(snapshotB);
    expect(snapshotA).toMatchSnapshot();
  });
});
