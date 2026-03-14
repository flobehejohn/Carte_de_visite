import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../api/gemini.js';
import { MAX_CITATIONS } from './oracle.schemas.js';

// Mocks stables (pas de dépendance au vrai corpus)
vi.mock('../knowledge/health.js', () => {
  return {
    getKnowledgeHealth: () => ({
      corpusLoaded: true,
      corpusSize: 123,
      corpusHash: 'test-hash',
      retrieverVersion: 'test-retriever',
      integrityMode: 'test',
    }),
  };
});

const retrieveMock = vi.fn((_q: string, _opts?: any) => [] as any[]);
const outOfCorpusMock = vi.fn((_q: string) => false);

vi.mock('../knowledge/retriever.js', () => {
  return {
    retrieveZaraCitations: (q: string, opts?: any) => retrieveMock(q, opts),
    isOutOfCorpusRequest: (q: string) => outOfCorpusMock(q),
  };
});

function makeRes() {
  const res: any = {
    headersSent: false,
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[String(k).toLowerCase()] = String(v);
    },
    send(s: any) {
      this.body = typeof s === 'string' ? JSON.parse(s) : s;
    },
    end(s: any) {
      this.body = typeof s === 'string' ? JSON.parse(s) : s;
    },
    json(obj: any) {
      this.body = obj;
    },
  };
  return res;
}

const citation = (id: string) => ({
  id,
  source: 'zarathoustra',
  title: 'Z',
  quote: '...',
  score: 0.9,
});

function makeOraclePayload() {
  return {
    quote: 'Stub quote',
    interpretation: 'Stub interpretation',
    keywords: ['stub'],
    citation_ids: ['1', '2'],
    delta: {},
    confidence: 0.9,
    visual_prescription: {
      primary_color: '#88aaff',
      chaos: 0.3,
      fog_density: 0.2,
      shape_archetype: 'torusKnot',
    },
  };
}

const stubStructuredOk = async () => {
  const payload = makeOraclePayload();
  return {
    ok: true,
    status: 200,
    text: JSON.stringify(payload),
    raw: {
      structured: true,
      fallback: false,
      repairApplied: false,
      reason: 'NATIVE_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
    },
    ms: 5,
  };
};

const stubStructuredRepairOk = async () => {
  const payload = makeOraclePayload();
  return {
    ok: true,
    status: 200,
    text: JSON.stringify(payload),
    raw: {
      structured: false,
      fallback: false,
      repairApplied: true,
      reason: 'NATIVE_REPAIR_OK',
      parseError: 'initial invalid json repaired',
      rawJsonError: 'INVALID_JSON_FROM_LLM',
      retryCount: 0,
    },
    ms: 5,
  };
};

const stubRawOk = async () => {
  const payload = makeOraclePayload();
  return {
    ok: true,
    status: 200,
    text: JSON.stringify(payload),
    raw: {
      structured: false,
      fallback: false,
      repairApplied: false,
      reason: 'RAW_OK',
      parseError: null,
      rawJsonError: null,
      retryCount: 0,
    },
    ms: 5,
  };
};

const stubStructuredInvalidJson = async () => {
  return {
    ok: false,
    status: 422,
    text: '{"quote":"Florian, ton nom repond',
    raw: {
      structured: false,
      fallback: false,
      repairApplied: false,
      reason: 'INVALID_JSON_FROM_LLM',
      parseError: 'JSON.parse failed (repair disabled)',
      rawJsonError: 'INVALID_JSON_FROM_LLM',
      retryCount: 1,
    },
    ms: 5,
  };
};

function readStructuredUsed(body: any): boolean {
  return Boolean(
    body?.meta?.structuredUsed ??
    body?.debug?.structuredUsed ??
    body?.structuredUsed ??
    false,
  );
}

function readRawJsonError(body: any): string | null {
  return (
    body?.rawJsonError ??
    body?.raw?.rawJsonError ??
    body?.meta?.rawJsonError ??
    null
  );
}

function readFinalJsonError(body: any): string | null {
  return (
    body?.finalJsonError ??
    body?.meta?.finalJsonError ??
    body?.jsonError ??
    null
  );
}

function makeOracleReq(minCitations = 2) {
  return {
    method: 'POST',
    headers: {},
    body: {
      mode: 'oracle',
      prompt: 'Rituel: test oracle',
      expectJson: true,
      wantCitations: true,
      minCitations,
      ritual: { nameOrNickname: 'test' },
    },
  } as any;
}

describe('fail-closed strict invariants (handler)', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...prevEnv };

    process.env.GEMINI_FAIL_CLOSED_STRICT = '1';
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.CONTRACT_GUARD = '0';

    retrieveMock.mockReset();
    retrieveMock.mockImplementation((_q: string, _opts?: any) => [] as any[]);
    outOfCorpusMock.mockReset();
    outOfCorpusMock.mockImplementation((_q: string) => false);
  });

  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('returns HTTP 422 when structured outputs are disabled for oracle', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '0';

    retrieveMock.mockReturnValue([citation('1'), citation('2'), citation('3')]);

    const handler = createHandler({ callGeminiImpl: stubRawOk as any });

    const req = makeOracleReq(2);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('STRICT_INVARIANT_VIOLATION');
    expect(Array.isArray(res.body.violations)).toBe(true);
    expect(res.body.violations.map((v: any) => v.code)).toContain(
      'STRUCTURED_OUTPUTS_DISABLED',
    );
  });

  it('returns HTTP 422 when minCitations is not satisfied (within contract range)', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';

    retrieveMock.mockReturnValue([citation('1'), citation('2')]);

    const handler = createHandler({
      callGeminiStructuredImpl: stubStructuredOk as any,
      callGeminiImpl: stubRawOk as any,
    });

    const req = makeOracleReq(MAX_CITATIONS);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('STRICT_INVARIANT_VIOLATION');

    const codes = res.body.violations.map((v: any) => v.code);
    expect(codes).toContain('CITATIONS_TOO_LOW');
  });

  it('returns HTTP 200 when strict invariants are satisfied natively', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';

    retrieveMock.mockReturnValue([
      citation('1'),
      citation('2'),
      citation('3'),
      citation('4'),
      citation('5'),
      citation('6'),
    ]);

    const handler = createHandler({
      callGeminiStructuredImpl: stubStructuredOk as any,
      callGeminiImpl: stubRawOk as any,
    });

    const req = makeOracleReq(2);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.raw?.structured).toBe(true);
    expect(Array.isArray(res.body.citationsUsed)).toBe(true);
    expect(res.body.citationsUsed.length).toBeGreaterThanOrEqual(2);
    expect(res.body.jsonError).toBe(null);
    expect(readFinalJsonError(res.body)).toBe(null);
    expect(res.body.violations).toEqual([]);
  });

  it('returns HTTP 200 for raw KO / final OK and keeps the raw error only in audit fields (Option B)', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';

    retrieveMock.mockReturnValue([
      citation('1'),
      citation('2'),
      citation('3'),
      citation('4'),
      citation('5'),
      citation('6'),
    ]);

    const handler = createHandler({
      callGeminiStructuredImpl: stubStructuredRepairOk as any,
      callGeminiImpl: stubRawOk as any,
    });

    const req = makeOracleReq(2);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);

    // Option B : état final accepté, audit brut conservé
    expect(readRawJsonError(res.body)).not.toBeNull();
    expect(readRawJsonError(res.body)).toBe('INVALID_JSON_FROM_LLM');
    expect(readFinalJsonError(res.body)).toBe(null);
    expect(res.body.jsonError).toBe(null);

    expect(readStructuredUsed(res.body)).toBe(true);
    expect(res.body.raw?.repairApplied).toBe(true);
    expect(res.body.raw?.structured).toBe(false);

    expect(Array.isArray(res.body.violations)).toBe(true);
    expect(res.body.violations).toEqual([]);

    expect(Array.isArray(res.body.citationsUsed)).toBe(true);
    expect(res.body.citationsUsed.length).toBeGreaterThanOrEqual(2);
  });

  it('returns HTTP 422 when oracle JSON is invalid instead of accepting a synthetic fallback as final state', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';

    retrieveMock.mockReturnValue([
      citation('1'),
      citation('2'),
      citation('3'),
      citation('4'),
      citation('5'),
      citation('6'),
    ]);

    const handler = createHandler({
      callGeminiStructuredImpl: stubStructuredInvalidJson as any,
      callGeminiImpl: stubRawOk as any,
    });

    const req = makeOracleReq(2);
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('STRICT_INVARIANT_VIOLATION');
    expect(res.body.json).toBeNull();
    expect(readFinalJsonError(res.body)).toBe('INVALID_JSON_FROM_LLM');
    expect(readStructuredUsed(res.body)).toBe(false);

    const codes = res.body.violations.map((v: any) => v.code);
    expect(codes).toContain('JSON_EMPTY');
    expect(codes).toContain('JSON_ERROR');
    expect(codes).toContain('STRUCTURED_NOT_USED');
  });
});
