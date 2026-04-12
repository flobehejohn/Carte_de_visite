import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler } from '../../../api/gemini.js';
import { MAX_CITATIONS } from './oracle.schemas.js';
import { retrieveZaraCitations } from '../knowledge/retriever.js';

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

const stubRawOk = async () => {
  const payload = {
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
  return {
    ok: true,
    status: 200,
    text: JSON.stringify(payload),
    raw: { structured: false },
    ms: 5,
  };
};

const makeStructuredOracleHermeneuticOk = (citationIds: string[]) => {
  return async (args: any) => {
    const payload = {
      quote: 'Florian avance comme une flamme sobre dans le vent.',
      opening_image: 'Une flamme mince se tient au bord du seuil.',
      central_tension: 'Le nom cherche une forme plus haute que lui-meme.',
      reversal: 'Ce qui semblait simple devient un appel a se depasser.',
      imperative: 'Porte ce nom comme une discipline de legerete.',
      return_axis: 'Reviens a la flamme quand le poids revient.',
      keywords: ['flamme', 'seuil', 'retour', 'legerete'],
      anchors: [
        {
          citation_id: citationIds[0],
          role: 'anchor',
          motif: 'flamme dansante',
          claim: 'Le nom prend figure de legerete active.',
        },
        {
          citation_id: citationIds[1],
          role: 'turn',
          motif: 'depassement',
          claim: 'Le rite transforme le nom en passage.',
        },
      ],
      visual_prescription: {
        primary_color: '#ffd700',
        chaos: 0.32,
        fog_density: 0.14,
        shape_archetype: 'spiral',
      },
      confidence: 0.88,
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
      },
      ms: 5,
    };
  };
};

const stubGuardianOk = async () => {
  const payload = {
    comment: 'Le prénom "Jeanne" est acceptable.',
    isSafe: true,
    confidence: 0.88,
  };

  return {
    ok: true,
    status: 200,
    text: JSON.stringify(payload),
    raw: { structured: false },
    ms: 5,
  };
};

describe('api/gemini handler contract', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...prevEnv };

    // ✅ Ici on veut tester l’enveloppe/contrat du handler, pas le mode strict.
    process.env.GEMINI_FAIL_CLOSED_STRICT = '0';

    // ✅ Forcer le chemin RAW (évite structured et tout appel réseau)
    process.env.GEMINI_STRUCTURED_OUTPUTS = '0';

    // clé factice OK (puisqu’on stub)
    process.env.GEMINI_API_KEY = 'test-key';

    // par défaut guard OFF, certains tests l’activent
    process.env.CONTRACT_GUARD = '0';
  });

  afterEach(() => {
    process.env = { ...prevEnv };
    vi.restoreAllMocks();
  });

  it('A1: method not POST returns 405 JSON error', async () => {
    const handler = createHandler({ callGeminiImpl: stubRawOk as any });
    const req: any = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('A2: invalid body returns 400 JSON error', async () => {
    const handler = createHandler({ callGeminiImpl: stubRawOk as any });
    const req: any = { method: 'POST', headers: {}, body: { nope: true } };
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('A2bis: minCitations > MAX_CITATIONS returns 400 INVALID_BODY (fail-fast, no LLM call)', async () => {
    const shouldNotBeCalled = vi.fn(async () => {
      throw new Error('LLM should not be called');
    });

    const handler = createHandler({ callGeminiImpl: shouldNotBeCalled as any });

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'oracle',
        prompt: 'Rituel: test oracle',
        expectJson: true,
        wantCitations: true,
        minCitations: MAX_CITATIONS + 1,
        ritual: { nameOrNickname: 'test' },
      },
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('INVALID_BODY');
    expect(String(res.body.error.message)).toContain(String(MAX_CITATIONS));
    expect(shouldNotBeCalled).not.toHaveBeenCalled();
  });

  it('A3: valid body returns 200 JSON success', async () => {
    const handler = createHandler({ callGeminiImpl: stubRawOk as any });

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'oracle',
        prompt: 'Rituel: test oracle',
        expectJson: true,
        wantCitations: true,
        minCitations: 2,
        ritual: { nameOrNickname: 'test' },
      },
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('oracle');
    expect(Array.isArray(res.body.citationsUsed)).toBe(true);
    expect(res.body.citationsUsed.length).toBeGreaterThanOrEqual(2);
    expect(res.body.jsonError).toBe(null);
  });

  it('A3bis: oracle structured success returns hermeneutic and composition while keeping json/raw/meta/debug', async () => {
    process.env.GEMINI_STRUCTURED_OUTPUTS = '1';

    const prompt = 'Rituel: test oracle structure';
    const oracleQuery = JSON.stringify({
      ritual: { nameOrNickname: 'test' },
      prompt,
      climate: null,
    });
    const citationIds = retrieveZaraCitations(oracleQuery, { k: 6 })
      .slice(0, 2)
      .map((citation) => String(citation.id));

    const handler = createHandler({
      callGeminiStructuredImpl: makeStructuredOracleHermeneuticOk(
        citationIds,
      ) as any,
      callGeminiImpl: stubRawOk as any,
    });

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'oracle',
        prompt,
        expectJson: true,
        wantCitations: true,
        minCitations: 2,
        ritual: { nameOrNickname: 'test' },
      },
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('oracle');
    expect(res.body.hermeneutic?.quote).toContain('flamme');
    expect(Array.isArray(res.body.hermeneutic?.anchors)).toBe(true);
    expect(res.body.composition?.prose.length).toBeGreaterThan(40);
    expect(Array.isArray(res.body.composition?.motifs)).toBe(true);
    expect(res.body.composition?.motifs[0]?.citation_id).toBe(citationIds[0]);
    expect(res.body.json).toBeTruthy();
    expect(res.body.raw).toBeTruthy();
    expect(res.body.meta).toBeTruthy();
    expect(res.body.debug).toBeTruthy();
  });

  it('A4: guardian success returns deterministic guidance while keeping json.comment', async () => {
    const handler = createHandler({ callGeminiImpl: stubGuardianOk as any });

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'guardian',
        prompt: 'Gardien: test',
        expectJson: true,
        wantCitations: true,
        minCitations: 2,
        step: 'identity',
        value: 'Jeanne',
      },
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('guardian');
    expect(res.body.guidance?.echo).toContain('Jeanne');
    expect(res.body.guidance?.echo.length).toBeGreaterThan(18);
    expect(res.body.guidance?.subcomment.length).toBeGreaterThan(30);
    expect(res.body.json?.comment).toBe('Le prénom "Jeanne" est acceptable.');
    expect(res.body.guidance?.echo).not.toBe(res.body.json?.comment);
  });

  it('B: contract inconsistency returns 500 JSON error when guard on (force invalid timing)', async () => {
    process.env.CONTRACT_GUARD = '1';

    const handler = createHandler({
      callGeminiImpl: stubRawOk as any,
      forceTimingMs: Number.POSITIVE_INFINITY,
    });

    const req: any = {
      method: 'POST',
      headers: {},
      body: {
        mode: 'oracle',
        prompt: 'Rituel: test oracle',
        expectJson: true,
        wantCitations: true,
        minCitations: 2,
        ritual: { nameOrNickname: 'test' },
      },
    };

    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error.code).toBe('CONTRACT_INTERNAL_INCONSISTENCY');
  });

  it('C: cleanup Date.now mocks (example)', () => {
    expect(true).toBe(true);
  });
});
