import { beforeEach, describe, expect, it } from 'vitest';

import { handleGeminiRequest } from '../../../api/gemini.js';
import {
  OracleJsonSchema,
  OracleRequestSchema,
} from '../contracts/oracle.schemas.js';
import type { Citation } from '../contracts/oracle.types.js';
import {
  loadZaraSentences,
  type ZaraSentence,
} from './loadZarathoustra.js';
import { retrieveZaraCitations } from './retriever.js';

type HandlerDeps = NonNullable<Parameters<typeof handleGeminiRequest>[1]>;
type StructuredImpl = NonNullable<HandlerDeps['callGeminiStructuredImpl']>;
type RawImpl = NonNullable<HandlerDeps['callGeminiImpl']>;

type CitationLike = Citation | Record<string, unknown>;

const PROMPT = 'Rituel: je franchis le seuil et je cite Zarathoustra.';

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((value) => String(value ?? '').trim())
    .filter((value) => value.length > 0);
}

function getStringField(
  value: Record<string, unknown>,
  field: string,
): string {
  const raw = value[field];
  return typeof raw === 'string' ? raw.trim() : '';
}

function getCitationId(citation: CitationLike): string {
  const record = citation as Record<string, unknown>;
  const fromRecord = getStringField(record, 'id');
  if (fromRecord.length > 0) {
    return fromRecord;
  }
  return String(citation.id ?? '').trim();
}

function getCitationSource(citation: CitationLike): string {
  const record = citation as Record<string, unknown>;
  const fromRecord = getStringField(record, 'source');
  if (fromRecord.length > 0) {
    return fromRecord;
  }
  return String(citation.source ?? '').trim();
}

function getCitationContent(citation: CitationLike): {
  text: string;
  quote: string;
} {
  const record = citation as Record<string, unknown>;
  const text = getStringField(record, 'text');
  const quote = getStringField(record, 'quote');
  return { text, quote };
}

function indexCorpusById(sentences: ZaraSentence[]): Map<string, ZaraSentence> {
  const byId = new Map<string, ZaraSentence>();
  for (const sentence of sentences) {
    byId.set(String(sentence.id), sentence);
  }
  return byId;
}

function assertCitationMatchesCorpus(
  citation: CitationLike,
  corpusById: Map<string, ZaraSentence>,
): void {
  const id = getCitationId(citation);
  expect(id.length).toBeGreaterThan(0);

  const source = getCitationSource(citation);
  expect(source).toBe('zarathoustra');

  const sentence = corpusById.get(id);
  expect(sentence).toBeTruthy();
  if (!sentence) return;

  const { text, quote } = getCitationContent(citation);
  expect(text.length > 0 || quote.length > 0).toBe(true);

  const corpusText = String(sentence.text ?? '').trim();
  expect(corpusText.length).toBeGreaterThan(0);

  if (text.length > 0) {
    expect(text).toBe(corpusText);
    return;
  }

  expect(
    corpusText.includes(quote) || quote.includes(corpusText),
  ).toBe(true);
}

function makeStructuredStub(citationIds: string[]): StructuredImpl {
  return async (args) => {
    const payload = {
      quote: 'Test quote',
      interpretation: 'Test interpretation',
      keywords: ['test'],
      citation_ids: citationIds,
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
}

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

describe('citation mapping contract', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';
    process.env.GEMINI_FAIL_CLOSED_STRICT = '1';
  });

  it('server citations map to real corpus excerpts', async () => {
    const corpus = loadZaraSentences();
    const corpusById = indexCorpusById(corpus);

    const expected = retrieveZaraCitations(PROMPT, { k: 6 });
    const selectedIds = expected
      .slice(0, 2)
      .map((citation) => getCitationId(citation))
      .filter((id) => id.length > 0);

    expect(selectedIds.length).toBe(2);

    const req = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: PROMPT,
      ritual: { nameOrNickname: 'mapping-proof' },
      expectJson: true,
      wantCitations: true,
      minCitations: 2,
    });

    const result = await handleGeminiRequest(req, {
      callGeminiStructuredImpl: makeStructuredStub(selectedIds),
      callGeminiImpl: stubRawCall,
    });

    const response = result.response;
    expect(response.citationsUsed.length).toBeGreaterThanOrEqual(2);

    for (const citation of response.citationsUsed) {
      assertCitationMatchesCorpus(citation, corpusById);
    }

    const parsedJson = OracleJsonSchema.parse(response.json) as Record<
      string,
      unknown
    >;

    const jsonCitationIds = toStringArray(parsedJson.citation_ids);
    expect(jsonCitationIds).toEqual(selectedIds);

    const jsonCitations = Array.isArray(parsedJson.citations)
      ? parsedJson.citations
      : [];

    expect(jsonCitations.length).toBeGreaterThanOrEqual(selectedIds.length);

    const responseCitationIds = new Set(
      response.citationsUsed.map((citation) => getCitationId(citation)),
    );

    const jsonIds: string[] = [];
    for (const rawCitation of jsonCitations) {
      const citation = rawCitation as CitationLike;
      assertCitationMatchesCorpus(citation, corpusById);

      const id = getCitationId(citation);
      jsonIds.push(id);
      expect(responseCitationIds.has(id)).toBe(true);
    }

    expect(jsonIds.slice(0, selectedIds.length)).toEqual(selectedIds);
    for (const id of selectedIds) {
      expect(jsonIds.includes(id)).toBe(true);
    }
  });
});
