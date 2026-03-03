import { describe, expect, it, vi } from 'vitest';

import { createHandler } from '../../../api/gemini.js';
import { ApiEnvelopeSchema, OracleRequestSchema } from './oracle.schemas.js';

type MockReq = {
  method: string;
  body?: unknown;
};

type MockRes = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  status: (code: number) => MockRes;
  setHeader: (k: string, v: string) => void;
  json: (payload: unknown) => void;
};

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[String(k).toLowerCase()] = String(v);
    },
    json(payload: unknown) {
      this.body = payload;
    },
  };
  return res;
}

const stubCall = async () => {
  const payload = {
    quote: 'Test quote',
    interpretation: 'Test interpretation',
    keywords: ['test'],
    citations: [],
    delta: {},
    confidence: 0.5,
    visual_prescription: { primary_color: '#88aaff', chaos: 0.3 },
  };
  return {
    ok: true,
    status: 200,
    raw: { stub: true },
    text: JSON.stringify(payload),
    ms: 5,
  };
};

describe('api/gemini handler contract', () => {
  it('A1: method not POST returns 405 JSON error', async () => {
    const req: MockReq = { method: 'GET' };
    const res = makeRes();
    await createHandler()(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    const body = res.body as any;
    expect(body.ok).toBe(false);
    expect(body.traceId).toBeTruthy();
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('A2: invalid body returns 400 JSON error', async () => {
    const req: MockReq = { method: 'POST', body: { mode: 'oracle' } };
    const res = makeRes();
    await createHandler()(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    const body = res.body as any;
    expect(body.ok).toBe(false);
    expect(body.traceId).toBeTruthy();
    expect(body.error.code).toBe('BAD_REQUEST');
  });

  it('A3: valid body returns 200 JSON success', async () => {
    const reqBody = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: 'Rituel: je franchis le seuil.',
      ritual: { nameOrNickname: 'test' },
      expectJson: true,
      wantCitations: true,
    });

    const req: MockReq = { method: 'POST', body: reqBody };
    const res = makeRes();

    process.env.GEMINI_API_KEY = 'test-key';
    await createHandler({ callGeminiImpl: stubCall })(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');

    const body = res.body as any;
    expect(body.ok).toBe(true);
    expect(body.traceId).toBeTruthy();
    expect(body.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(body.mode).toBeTruthy();
    expect(body.model).toBeTruthy();
    expect(body.text).toBeTruthy();
    expect(Array.isArray(body.citationsUsed)).toBe(true);
    expect(body.knowledge).toBeTruthy();
  });

  it('B: contract broken returns 500 JSON error when guard on', async () => {
    const reqBody = OracleRequestSchema.parse({
      mode: 'oracle',
      prompt: 'Rituel: je franchis le seuil.',
      ritual: { nameOrNickname: 'test' },
      expectJson: true,
      wantCitations: true,
    });

    const req: MockReq = { method: 'POST', body: reqBody };
    const res = makeRes();

    process.env.GEMINI_API_KEY = 'test-key';
    const prev = process.env.CONTRACT_GUARD;
    process.env.CONTRACT_GUARD = '1';

    await createHandler({ callGeminiImpl: stubCall, forceTimingMs: -1 })(
      req,
      res,
    );

    process.env.CONTRACT_GUARD = prev;

    expect(res.statusCode).toBe(500);
    const body = res.body as any;
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('CONTRACT_BROKEN');
    expect(body.traceId).toBeTruthy();
  });

  it('C: ApiEnvelopeSchema accepts success and error payloads', () => {
    const okPayload = {
      ok: true,
      traceId: 'srv_ok',
      mode: 'oracle',
      model: 'gemini-2.5-flash',
      text: 'ok',
      json: null,
      jsonError: null,
      citationsUsed: [{ source: 'zarathoustra' }],
      knowledge: { corpusLoaded: true, corpusSize: 10, retrieverVersion: '1.0.0' },
      timings: { totalMs: 1 },
    };
    const errPayload = {
      ok: false,
      traceId: 'srv_err',
      error: { code: 'BAD_REQUEST', message: 'Invalid request body' },
    };
    expect(ApiEnvelopeSchema.safeParse(okPayload).success).toBe(true);
    expect(ApiEnvelopeSchema.safeParse(errPayload).success).toBe(true);
  });

  it('cleanup Date.now mocks', () => {
    vi.restoreAllMocks();
  });
});
