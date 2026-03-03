// api/gemini.ts
import {
  ApiEnvelopeSchema,
  OracleRequestSchema,
  OracleResponseSchema,
} from '../src/server/contracts/oracle.schemas.js';
import type {
  Citation,
  OracleRequest,
  OracleResponse,
} from '../src/server/contracts/oracle.types.js';
import { callGeminiStructured } from '../src/server/gemini/structuredOracle.js';
import { getKnowledgeHealth } from '../src/server/knowledge/health.js';
import {
  isOutOfCorpusRequest,
  retrieveZaraCitations,
} from '../src/server/knowledge/retriever.js';
import { callGemini } from '../src/server/llm/gemini.client.js';
import {
  applyCitationsToJson,
  normalizeOrbDelta,
  parseGuardianJson,
  parseOracleJson,
  tryParseJson,
} from '../src/server/llm/parse.js';
import {
  buildGuardianPrompt,
  buildOraclePrompt,
  buildRawPrompt,
  sanitizeUserPrompt,
  shouldRequireCitations,
} from '../src/server/llm/prompt.builder.js';
import {
  clampNumber,
  makeTraceId,
  safeLog,
} from '../src/server/observability/trace.js';

type GeminiMode = 'raw' | 'oracle' | 'guardian';

type HandlerDeps = {
  callGeminiImpl?: typeof callGemini;
  callGeminiStructuredImpl?: typeof callGeminiStructured;
  forceTimingMs?: number;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

type ApiErrorPayload = {
  ok: false;
  traceId: string;
  error: { code: string; message: string };
  timings?: { totalMs?: number; llmMs?: number; retrieveMs?: number };
  [k: string]: unknown;
};

type ApiSuccessPayload = {
  ok: true;
  traceId: string;
  timings: { totalMs: number; llmMs?: number; retrieveMs?: number };
  [k: string]: unknown;
};

type HandleResult = {
  response: OracleResponse;
  llmMs?: number;
  retrieveMs?: number;
};

function normalizeModelName(v?: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function normalizeMode(v?: string): GeminiMode {
  const m = String(v ?? '')
    .trim()
    .toLowerCase();
  if (m === 'oracle' || m === 'guardian') return m as GeminiMode;
  return 'raw';
}

function buildRetrievalQuery(body: OracleRequest, mode: GeminiMode): string {
  if (mode === 'oracle') {
    return JSON.stringify({
      ritual: body.ritual ?? {},
      prompt: body.prompt ?? '',
      climate: body.climateSnapshot ?? null,
    });
  }
  if (mode === 'guardian') {
    return JSON.stringify({
      step: body.step ?? '',
      value: body.value ?? '',
      prompt: body.prompt ?? '',
    });
  }
  return String(body.prompt ?? '');
}

function safeOracleFallback(citations: Citation[], outOfCorpus: boolean): any {
  return {
    quote: outOfCorpus ? 'Hors corpus.' : 'Le silence repond...',
    interpretation: outOfCorpus
      ? 'Demande hors corpus. Je ne cite que Zarathoustra.'
      : 'La parole manque encore de forme, mais le texte demeure. Recommence.',
    keywords: outOfCorpus ? ['hors', 'corpus'] : ['silence', 'seuil'],
    citations: citations.slice(0, Math.max(1, Math.min(2, citations.length))),
    delta: {},
    confidence: 0.2,
    visual_prescription: {
      primary_color: '#88aaff',
      chaos: 0.3,
      fog_density: 0.25,
      shape_archetype: 'torusKnot',
    },
  };
}

function safeGuardianFallback(): any {
  return {
    comment: 'Le seuil reste ouvert.',
    isSafe: true,
    citations: [],
    confidence: 0.6,
  };
}

const JSON_ERROR_ALLOWED = new Set<string>([
  'NONE',
  'INVALID_REQUEST',
  'MISSING_API_KEY',
  'UPSTREAM_ERROR',
  'INVALID_JSON_FROM_LLM',
  'KNOWLEDGE_EMPTY',
  'KNOWLEDGE_CORRUPTED',
  'INTERNAL_ERROR',
]);

function toJsonError(code: string | null): OracleResponse['jsonError'] {
  if (code === null) return null;
  return JSON_ERROR_ALLOWED.has(code)
    ? (code as OracleResponse['jsonError'])
    : ('INTERNAL_ERROR' as OracleResponse['jsonError']);
}

function logEvent(
  level: 'INFO' | 'WARN' | 'ERR',
  traceId: string,
  msg: string,
  meta: Record<string, unknown> = {},
): void {
  safeLog(level, traceId, msg, meta);
}

/**
 * ✅ IMPORTANT : sanitize raw pour garantir JSON.stringify(payload) sans 500
 * - si raw est non sérialisable => on le remplace par un objet "raw_omitted"
 * - si raw est trop volumineux => on remplace par preview
 */
function sanitizeRawForJson(
  raw: unknown,
  traceId: string,
  maxChars = 6000,
): unknown {
  if (raw === undefined) return undefined;
  if (raw === null) return null;

  try {
    const s = JSON.stringify(raw);
    if (s.length <= maxChars) return raw;
    return {
      _raw_omitted: true,
      reason: 'RAW_TOO_LARGE',
      traceId,
      preview: s.slice(0, maxChars) + '…',
    };
  } catch {
    // non serializable (circular, functions, etc.)
    let hint = '';
    try {
      hint = Object.prototype.toString.call(raw);
    } catch {
      hint = 'unknown';
    }
    return {
      _raw_omitted: true,
      reason: 'RAW_NOT_SERIALIZABLE',
      traceId,
      hint,
    };
  }
}

function buildResponse(args: {
  traceId: string;
  model: string;
  mode: GeminiMode;
  text: string;
  json: unknown | null;
  jsonError: string | null;
  citationsUsed: Citation[];
  raw?: unknown;
}): OracleResponse {
  const knowledge = getKnowledgeHealth();
  const payload: OracleResponse = {
    traceId: args.traceId,
    model: args.model,
    mode: args.mode,
    text: args.text,
    json: args.json,
    jsonError: toJsonError(args.jsonError),
    citationsUsed: args.citationsUsed,
    knowledge,
  };
  if (args.raw !== undefined)
    payload.raw = sanitizeRawForJson(args.raw, args.traceId);
  return OracleResponseSchema.parse(payload);
}

function getHeader(req: any, name: string): string {
  const key = String(name).toLowerCase();
  const headers = (req?.headers ?? {}) as Record<string, unknown>;
  const v = headers[key];
  return v ? String(v) : '';
}

function ensureTraceId(req: any, body?: { traceId?: unknown }): string {
  const fromHeader = getHeader(req, 'x-trace-id').trim();
  if (fromHeader) return fromHeader;
  const fromBody = String(body?.traceId ?? '').trim();
  if (fromBody) return fromBody;
  return makeTraceId('srv');
}

function respondJson(
  res: any,
  status: number,
  payload: unknown,
  traceId: string,
): boolean {
  try {
    if (!res || res.headersSent) return false;

    let finalStatus = status;
    let finalPayload: unknown = payload;

    let json = '';
    try {
      json = JSON.stringify(payload);
    } catch {
      finalStatus = 500;
      const fallback: ApiErrorPayload = {
        ok: false,
        traceId,
        error: {
          code: 'JSON_STRINGIFY_FAILED',
          message: 'Failed to serialize JSON',
        },
      };
      finalPayload = fallback;
      json = JSON.stringify(fallback);
    }

    res.status(finalStatus);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');

    if (typeof res.send === 'function') {
      res.send(json);
    } else if (typeof res.end === 'function') {
      res.end(json);
    } else if (typeof res.json === 'function') {
      res.json(finalPayload);
    }
    return true;
  } catch {
    return false;
  }
}

function buildApiSuccessEnvelope(
  response: OracleResponse,
  totalMs: number,
  llmMs?: number,
  retrieveMs?: number,
): ApiSuccessPayload {
  return {
    ok: true,
    timings: { totalMs, llmMs, retrieveMs },
    ...response,
  };
}

function buildApiErrorEnvelope(
  traceId: string,
  code: string,
  message: string,
  totalMs?: number,
  llmMs?: number,
  retrieveMs?: number,
): ApiErrorPayload {
  return {
    ok: false,
    traceId,
    error: { code, message },
    timings: totalMs !== undefined ? { totalMs, llmMs, retrieveMs } : undefined,
  };
}

function isContractGuardOn(): boolean {
  if (process.env.CONTRACT_GUARD === '1') return true;
  const nodeEnv = String(process.env.NODE_ENV ?? '').toLowerCase();
  if (nodeEnv && nodeEnv !== 'production') return true;
  const vercelEnv = String(process.env.VERCEL_ENV ?? '').toLowerCase();
  return vercelEnv === 'preview' || vercelEnv === 'development';
}

function isStructuredOutputsOn(): boolean {
  const v = String(process.env.GEMINI_STRUCTURED_OUTPUTS ?? '').trim();
  if (v === '0') return false;
  if (v === '1') return true;
  return true;
}

function getJsonRetryMax(): number {
  const n = Number(process.env.GEMINI_JSON_RETRY_MAX ?? '1');
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(3, Math.floor(n)));
}

function safeSlice(v: unknown, max = 220): string {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function safeJsonSlice(v: unknown, max = 900): string {
  try {
    const s = JSON.stringify(v);
    if (!s) return '';
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return '';
  }
}

function summarizeZodIssues(
  issues: any,
): { fields?: string[]; form?: string[] } | null {
  if (!issues || typeof issues !== 'object') return null;

  const fieldErrors = (issues as any).fieldErrors;
  const formErrors = (issues as any).formErrors;

  const fields =
    fieldErrors && typeof fieldErrors === 'object'
      ? Object.keys(fieldErrors).filter(Boolean).slice(0, 20)
      : [];

  const form = Array.isArray(formErrors)
    ? formErrors
        .map((x) => String(x))
        .filter(Boolean)
        .slice(0, 5)
    : [];

  if (!fields.length && !form.length) return null;
  return {
    fields: fields.length ? fields : undefined,
    form: form.length ? form : undefined,
  };
}

function isStructuredUsed(call: any): boolean {
  return Boolean(call?.raw?.structured === true);
}

function addStructuredStabilityHints(prompt: string): string {
  return (
    String(prompt ?? '') +
    `

---
CONTRAINTES DE SORTIE (STRICT):
- Réponds par un JSON valide uniquement (pas de markdown, pas de \`\`\`).
- Évite absolument les retours à la ligne dans les valeurs string ; utilise "\\n" si nécessaire.
- Idéalement, renvoie un JSON sur une seule ligne.
`
  );
}

function pickApiKey(): {
  key: string | null;
  source: 'GEMINI_API_KEY' | 'GOOGLE_API_KEY' | 'NONE';
  both: boolean;
} {
  const geminiKey = String(process.env.GEMINI_API_KEY ?? '').trim();
  const googleKey = String(process.env.GOOGLE_API_KEY ?? '').trim();
  const both = Boolean(geminiKey && googleKey);

  if (geminiKey) return { key: geminiKey, source: 'GEMINI_API_KEY', both };
  if (googleKey) return { key: googleKey, source: 'GOOGLE_API_KEY', both };
  return { key: null, source: 'NONE', both };
}

export async function handleGeminiRequest(
  body: OracleRequest,
  deps: HandlerDeps = {},
): Promise<HandleResult> {
  const traceId = String(body.traceId ?? '').trim() || makeTraceId('srv');
  const modeInput = String(body.mode ?? '')
    .trim()
    .toLowerCase();
  const mode = normalizeMode(modeInput);

  const envModel = normalizeModelName(process.env.GEMINI_MODEL);
  const clientModel = normalizeModelName(body.model);
  const model = envModel || clientModel || DEFAULT_MODEL;

  const expectJson =
    body.expectJson === true || modeInput === 'json' || mode !== 'raw';

  const temperature =
    mode === 'guardian'
      ? clampNumber(body.temperature, 0, 2, 0.2)
      : clampNumber(body.temperature, 0, 2, 0.7);

  const topP = clampNumber(body.topP, 0, 1, 0.9);

  const maxOutputTokens =
    mode === 'oracle'
      ? Math.round(clampNumber(body.maxOutputTokens, 1, 8192, 1200))
      : Math.round(clampNumber(body.maxOutputTokens, 1, 8192, 600));

  const timeoutMs = clampNumber(
    process.env.GEMINI_TIMEOUT_MS
      ? Number(process.env.GEMINI_TIMEOUT_MS)
      : undefined,
    1000,
    60000,
    25000,
  );

  const wantCitations =
    body.wantCitations === true ||
    mode !== 'raw' ||
    shouldRequireCitations(body.prompt, body.wantCitations);

  let citationsUsed: Citation[] = [];
  let outOfCorpus = false;
  let knowledgeError: string | null = null;

  let retrieveMs: number | undefined = undefined;

  if (wantCitations) {
    const t0 = Date.now();
    const query = buildRetrievalQuery(body, mode);
    outOfCorpus = isOutOfCorpusRequest(query);

    try {
      citationsUsed = retrieveZaraCitations(query, {
        k: mode === 'oracle' ? 6 : 4,
        traceId,
      });
    } catch (err: any) {
      knowledgeError = err?.message
        ? String(err.message)
        : 'KNOWLEDGE_LOAD_FAILED';
      citationsUsed = [];
    } finally {
      retrieveMs = Math.max(0, Date.now() - t0);
    }

    if (citationsUsed.length < 2) {
      knowledgeError = knowledgeError ?? 'KNOWLEDGE_EMPTY';
    }
  }

  if (knowledgeError && mode !== 'raw') {
    const knowledgeErrorCode =
      knowledgeError.indexOf('CRITICAL') >= 0
        ? 'KNOWLEDGE_CORRUPTED'
        : 'KNOWLEDGE_EMPTY';

    logEvent('ERR', traceId, 'knowledge_error', { code: knowledgeErrorCode });

    const fallback =
      mode === 'oracle'
        ? safeOracleFallback(citationsUsed, outOfCorpus)
        : safeGuardianFallback();

    const json =
      mode === 'oracle' || mode === 'guardian'
        ? applyCitationsToJson(fallback, citationsUsed)
        : null;

    return {
      response: buildResponse({
        traceId,
        model,
        mode,
        text:
          typeof fallback?.quote === 'string'
            ? fallback.quote
            : 'Oracle disconnected.',
        json,
        jsonError: knowledgeErrorCode,
        citationsUsed,
      }),
      retrieveMs,
      llmMs: undefined,
    };
  }

  let finalPrompt = '';
  if (mode === 'raw') {
    const prompt = sanitizeUserPrompt(body.prompt);
    if (!prompt) {
      return {
        response: buildResponse({
          traceId,
          model,
          mode,
          text: 'prompt is required',
          json: null,
          jsonError: 'INVALID_REQUEST',
          citationsUsed,
        }),
        retrieveMs,
        llmMs: undefined,
      };
    }
    finalPrompt = buildRawPrompt(prompt, expectJson);
  } else if (mode === 'oracle') {
    finalPrompt = buildOraclePrompt({
      ritual: body.ritual,
      climateSnapshot: body.climateSnapshot,
      prompt: body.prompt,
      citations: citationsUsed,
      outOfCorpus,
    });
  } else {
    finalPrompt = buildGuardianPrompt({
      step: body.step,
      value: body.value,
      prompt: body.prompt,
      citations: citationsUsed,
      outOfCorpus,
    });
  }

  const keyPick = pickApiKey();
  if (!keyPick.key) {
    return {
      response: buildResponse({
        traceId,
        model,
        mode,
        text: 'Missing GEMINI_API_KEY (or GOOGLE_API_KEY) on server.',
        json: null,
        jsonError: 'MISSING_API_KEY',
        citationsUsed,
      }),
      retrieveMs,
      llmMs: undefined,
    };
  }

  if (keyPick.both) {
    logEvent('WARN', traceId, 'both_api_keys_set', {
      prefer: 'GEMINI_API_KEY',
      advice: 'Unset GOOGLE_API_KEY (recommended) to avoid SDK ambiguity.',
    });
  }

  const structuredWanted =
    isStructuredOutputsOn() &&
    expectJson &&
    (mode === 'oracle' || mode === 'guardian');

  logEvent('INFO', traceId, 'start', {
    mode,
    model,
    keySource: keyPick.source,
    cit: citationsUsed.length,
    out: outOfCorpus ? 1 : 0,
    structured: structuredWanted ? 1 : 0,
  });

  let llmMs: number | undefined = undefined;

  let call:
    | Awaited<ReturnType<typeof callGemini>>
    | Awaited<ReturnType<typeof callGeminiStructured>>;

  const retryMax = getJsonRetryMax();

  if (structuredWanted) {
    const structuredImpl =
      deps.callGeminiStructuredImpl ?? callGeminiStructured;

    const baseStructuredPrompt = addStructuredStabilityHints(finalPrompt);

    const tryStructured = async (attempt: number, extraHint?: string) => {
      const p =
        attempt === 0
          ? baseStructuredPrompt
          : baseStructuredPrompt +
            `

---
RÉ-ESSAI ${attempt}/${retryMax}:
- Le JSON précédent était invalide OU le schéma était invalide.
- Renvoie UN JSON valide uniquement, sur UNE ligne.
${extraHint ? `- Détail: ${extraHint}` : ''}

`;
      const temp = attempt === 0 ? temperature : Math.min(temperature, 0.2);

      return await structuredImpl({
        key: keyPick.key!,
        model,
        prompt: p,
        temperature: temp,
        topP,
        maxOutputTokens,
        timeoutMs,
        traceId,
        mode,
      });
    };

    let st = await tryStructured(0);
    llmMs = st.ms;

    let retryCount = 0;

    while (!st.ok && retryCount < retryMax) {
      const rawAny = (st as any).raw ?? null;
      const parseError = rawAny?.parseError
        ? String(rawAny.parseError)
        : undefined;
      const reason = rawAny?.reason
        ? String(rawAny.reason)
        : rawAny?.error
          ? String(rawAny.error)
          : 'unknown';

      logEvent('WARN', traceId, 'structured_retry', {
        retryCount,
        reason,
        parseError,
      });

      retryCount++;
      st = await tryStructured(retryCount, parseError ?? reason);
      llmMs = st.ms;
    }

    if (st.ok) {
      call = {
        ...(st as any),
        raw: {
          ...((st as any).raw ?? {}),
          retryCount,
        },
      } as any;
    } else {
      const rawAny = (st as any).raw ?? null;

      const issuesSummary = summarizeZodIssues(rawAny?.issues);
      const preview = rawAny?.parsedPreview
        ? safeJsonSlice(rawAny.parsedPreview, 650)
        : '';

      logEvent('WARN', traceId, 'structured_fallback', {
        status: (st as any)?.status,
        reason: rawAny?.reason ?? rawAny?.error ?? 'unknown',
        parseError: rawAny?.parseError ?? undefined,
        issues: issuesSummary ?? undefined,
        preview: preview || undefined,
        retryCount,
      });

      const rawImpl = deps.callGeminiImpl ?? callGemini;
      const raw = await rawImpl({
        key: keyPick.key!,
        model,
        prompt: finalPrompt,
        temperature,
        topP,
        maxOutputTokens,
        timeoutMs,
        traceId,
      });

      llmMs = raw.ms;

      call = {
        ...(raw as any),
        raw: {
          ...((raw as any).raw ?? {}),
          fallback: true,
          reason: 'STRUCTURED_FAILED',
          parseError: rawAny?.parseError ?? rawAny?.error ?? undefined,
          retryCount,
        },
      } as any;
    }
  } else {
    const rawImpl = deps.callGeminiImpl ?? callGemini;
    const raw = await rawImpl({
      key: keyPick.key,
      model,
      prompt: finalPrompt,
      temperature,
      topP,
      maxOutputTokens,
      timeoutMs,
      traceId,
    });
    llmMs = raw.ms;
    call = raw as any;
  }

  if (!call.ok) {
    logEvent('WARN', traceId, 'upstream_error', {
      status: (call as any).status,
      msg: safeSlice((call as any).text),
    });

    const fallback =
      mode === 'oracle'
        ? safeOracleFallback(citationsUsed, outOfCorpus)
        : mode === 'guardian'
          ? safeGuardianFallback()
          : null;

    const json =
      mode === 'oracle' || mode === 'guardian'
        ? applyCitationsToJson(fallback, citationsUsed)
        : null;

    return {
      response: buildResponse({
        traceId,
        model,
        mode,
        text:
          typeof (fallback as any)?.quote === 'string'
            ? (fallback as any).quote
            : String((call as any).text ?? ''),
        json,
        jsonError: 'UPSTREAM_ERROR',
        citationsUsed,
        raw: (call as any).raw,
      }),
      retrieveMs,
      llmMs,
    };
  }

  let json: unknown | null = null;
  let jsonError: string | null = null;

  if (expectJson) {
    if (mode === 'oracle') {
      const parsed = parseOracleJson((call as any).text ?? '');
      json = parsed.json;
      jsonError = parsed.jsonError ? 'INVALID_JSON_FROM_LLM' : null;
    } else if (mode === 'guardian') {
      const parsed = parseGuardianJson((call as any).text ?? '');
      json = parsed.json;
      jsonError = parsed.jsonError ? 'INVALID_JSON_FROM_LLM' : null;
    } else {
      const parsed = tryParseJson((call as any).text ?? '');
      if (parsed.ok) {
        json = parsed.value;
        jsonError = null;
      } else {
        json = null;
        jsonError = 'INVALID_JSON_FROM_LLM';
      }
    }
  }

  if ((mode === 'oracle' || mode === 'guardian') && json) {
    json = applyCitationsToJson(json, citationsUsed);
    if (json && typeof json === 'object') {
      const delta = normalizeOrbDelta((json as any).delta);
      (json as any).delta = delta;
    }
  }

  if ((mode === 'oracle' || mode === 'guardian') && !json) {
    json =
      mode === 'oracle'
        ? safeOracleFallback(citationsUsed, outOfCorpus)
        : safeGuardianFallback();
    json = applyCitationsToJson(json, citationsUsed);
    jsonError = jsonError ?? 'INVALID_JSON_FROM_LLM';
  }

  const raw = (call as any)?.raw ?? null;

  logEvent('INFO', traceId, 'done', {
    ms: llmMs,
    json: Boolean(json),
    err: Boolean(jsonError),
    structured: structuredWanted ? 1 : 0,
    structuredUsed: isStructuredUsed(call) ? 1 : 0,
    repaired: Boolean(raw?.repaired) ? 1 : 0,
    retryCount:
      typeof raw?.retryCount === 'number'
        ? raw.retryCount
        : Number(raw?.retryCount ?? 0) || 0,
    fallback: Boolean(raw?.fallback) ? 1 : 0,
    reason: typeof raw?.reason === 'string' ? raw.reason : undefined,
    parseError:
      typeof raw?.parseError === 'string' ? raw.parseError : undefined,
  });

  return {
    response: buildResponse({
      traceId,
      model,
      mode,
      text: String((call as any).text ?? ''),
      json,
      jsonError,
      citationsUsed,
      raw,
    }),
    retrieveMs,
    llmMs,
  };
}

export function createHandler(deps: HandlerDeps = {}) {
  return async function handler(req: any, res: any) {
    const startedAt = Date.now();
    const traceId = ensureTraceId(req, req?.body);

    try {
      if (req.method !== 'POST') {
        const payload = buildApiErrorEnvelope(
          traceId,
          'METHOD_NOT_ALLOWED',
          'Method Not Allowed',
        );
        respondJson(res, 405, payload, traceId);
        return;
      }

      const parsed = OracleRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const payload = buildApiErrorEnvelope(
          traceId,
          'BAD_REQUEST',
          'Invalid request body',
        );
        respondJson(res, 400, payload, traceId);
        return;
      }

      const prompt = String(parsed.data.prompt ?? '').trim();
      if (!prompt) {
        const payload = buildApiErrorEnvelope(
          traceId,
          'BAD_REQUEST',
          'prompt is required',
        );
        respondJson(res, 400, payload, traceId);
        return;
      }

      const body: OracleRequest = { ...parsed.data, traceId };

      const result = await handleGeminiRequest(body, deps);

      const totalMs =
        typeof deps.forceTimingMs === 'number'
          ? deps.forceTimingMs
          : Math.max(0, Date.now() - startedAt);

      const payload = buildApiSuccessEnvelope(
        result.response,
        totalMs,
        result.llmMs,
        result.retrieveMs,
      );

      const parsedEnvelope = ApiEnvelopeSchema.safeParse(payload);
      if (!parsedEnvelope.success) {
        if (isContractGuardOn()) {
          logEvent('ERR', traceId, 'contract_broken', {
            code: 'CONTRACT_BROKEN',
          });
          const errPayload = buildApiErrorEnvelope(
            traceId,
            'CONTRACT_BROKEN',
            'Response failed runtime contract validation',
            totalMs,
            result.llmMs,
            result.retrieveMs,
          );
          respondJson(res, 500, errPayload, traceId);
          return;
        }
        logEvent('WARN', traceId, 'contract_warn', { code: 'CONTRACT_BROKEN' });
      }

      respondJson(res, 200, payload, traceId);
    } catch {
      const totalMs = Math.max(0, Date.now() - startedAt);
      logEvent('ERR', traceId, 'handler_error', { code: 'INTERNAL_ERROR' });
      const payload = buildApiErrorEnvelope(
        traceId,
        'INTERNAL_ERROR',
        'Internal error',
        totalMs,
      );
      respondJson(res, 500, payload, traceId);
    }
  };
}

export default createHandler();
