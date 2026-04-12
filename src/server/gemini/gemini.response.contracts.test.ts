import { describe, expect, it } from 'vitest';
import { GeminiEnvelopeSchema } from '../../../src/shared/contracts/gemini.response.contracts.js';

describe('GeminiEnvelopeSchema', () => {
  it('accepts repaired final state without mixed signal', () => {
    const envelope = {
      ok: true,
      traceId: 'srv_test',
      model: 'gemini-2.5-flash',
      mode: 'guardian',
      text: '{"comment":"ok","isSafe":true}',
      json: { comment: 'ok', isSafe: true },
      jsonError: null,
      rawJsonError: 'INVALID_JSON_FROM_LLM',
      finalJsonError: null,
      raw: {
        structured: false,
        fallback: true,
        repairApplied: true,
        reason: 'FALLBACK_REPAIR_OK',
        parseError: 'JSON.parse failed',
        rawJsonError: 'INVALID_JSON_FROM_LLM',
        retryCount: 1,
      },
      meta: {
        structuredUsed: true,
        rawStructured: false,
        fallback: true,
        repairApplied: true,
        rawJsonError: 'INVALID_JSON_FROM_LLM',
        finalJsonError: null,
        corpusLoaded: true,
        citationsCount: 2,
        sources: ['zarathoustra'],
      },
      citationsUsed: [
        { id: '1', source: 'zarathoustra' },
        { id: '2', source: 'zarathoustra' },
      ],
      knowledge: { corpusLoaded: true },
      violations: [],
      timings: { totalMs: 10, llmMs: 5, retrieveMs: 1 },
    };

    expect(() => GeminiEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it('rejects mixed signal when JSON_ERROR exists but finalJsonError is null', () => {
    const envelope = {
      ok: false,
      traceId: 'srv_test',
      model: 'gemini-2.5-flash',
      mode: 'guardian',
      text: '{"comment":"ok","isSafe":true}',
      json: { comment: 'ok', isSafe: true },
      jsonError: null,
      rawJsonError: 'INVALID_JSON_FROM_LLM',
      finalJsonError: null,
      raw: {
        structured: false,
        fallback: true,
        repairApplied: true,
        reason: 'FALLBACK_REPAIR_OK',
        parseError: 'JSON.parse failed',
        rawJsonError: 'INVALID_JSON_FROM_LLM',
        retryCount: 1,
      },
      meta: {
        structuredUsed: true,
        rawStructured: false,
        fallback: true,
        repairApplied: true,
        rawJsonError: 'INVALID_JSON_FROM_LLM',
        finalJsonError: null,
        corpusLoaded: true,
        citationsCount: 2,
        sources: ['zarathoustra'],
      },
      citationsUsed: [
        { id: '1', source: 'zarathoustra' },
        { id: '2', source: 'zarathoustra' },
      ],
      knowledge: { corpusLoaded: true },
      violations: [
        { code: 'JSON_ERROR', message: 'should not be here' },
      ],
      timings: { totalMs: 10, llmMs: 5, retrieveMs: 1 },
    };

    expect(() => GeminiEnvelopeSchema.parse(envelope)).toThrow();
  });
});
