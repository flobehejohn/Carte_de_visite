import { describe, expect, it } from 'vitest';

import { ApiEnvelopeSchema } from './oracle.schemas.js';

describe('api wire envelope', () => {
  it('accepts success payload', () => {
    const payload = {
      ok: true,
      timings: { totalMs: 12 },
      traceId: 'srv_test',
      mode: 'oracle',
      model: 'gemini-2.5-flash',
      text: 'ok',
      json: null,
      jsonError: null,
      citationsUsed: [{ id: '1', text: 't', score: 1, source: 'zarathoustra' }],
      knowledge: {
        corpusLoaded: true,
        corpusSize: 1000,
        retrieverVersion: '1.0.0',
      },
    };

    const parsed = ApiEnvelopeSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it('accepts error payload', () => {
    const payload = {
      ok: false,
      traceId: 'srv_err',
      error: { code: 'INVALID_REQUEST', message: 'Invalid request body' },
    };
    const parsed = ApiEnvelopeSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });
});
