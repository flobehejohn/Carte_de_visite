// api/gemini.ts
import {
  ApiEnvelopeSchema,
  GuardianJsonSchema,
  MAX_CITATIONS,
  OracleJsonSchema,
  OracleRequestSchema,
  OracleResponseSchema,
} from '../src/server/contracts/oracle.schemas.js';
import type {
  Citation,
  OracleRequest,
  OracleResponse,
} from '../src/server/contracts/oracle.types.js';
import type {
  GeminiMode,
  StrictViolation,
} from '../src/server/gemini/contract-types.js';
import { evaluateStrictInvariants } from '../src/server/gemini/evaluate-strict-invariants.js';
import {
  normalizeFinalState,
  normalizeRawContractMeta,
} from '../src/server/gemini/normalize-final-state.js';
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
import { GeminiEnvelopeSchema } from '../src/shared/contracts/gemini.response.contracts.js';

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

function isFailClosedStrictOn(mode: GeminiMode): boolean {
  if (mode === 'raw') return false;
  const v = String(process.env.GEMINI_FAIL_CLOSED_STRICT ?? '').trim();
  if (v === '0') return false;
  if (v === '1') return true;
  return true;
}

function getMinCitationsEffective(
  body: OracleRequest,
  mode: GeminiMode,
): number {
  if (mode === 'raw') return 0;
  const raw = clampNumber((body as any).minCitations, 0, MAX_CITATIONS, 2);
  return Math.max(2, Math.floor(raw));
}

function extractCitationSource(c: any): string {
  return String(c?.source ?? '')
    .trim()
    .toLowerCase();
}

function normalizeModelName(v?: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function normalizeJsonContractError(code: unknown): string {
  const s = String(code ?? '').trim();
  if (!s) return 'INVALID_JSON_FROM_LLM';
  if (s === 'INVALID_JSON_SCHEMA') return 'SCHEMA_VALIDATION_FAILED';
  if (JSON_ERROR_ALLOWED.has(s)) return s;
  return 'INVALID_JSON_FROM_LLM';
}

function mergeRawMeta(
  raw: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}),
    ...patch,
  };
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
      climate: (body as any).climateSnapshot ?? null,
    });
  }
  if (mode === 'guardian') {
    return JSON.stringify({
      step: (body as any).step ?? '',
      value: (body as any).value ?? '',
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
    confidence: 0.6,
    citations: [],
    citation_ids: [],
  };
}

const JSON_ERROR_ALLOWED = new Set<string>([
  'NONE',
  'INVALID_REQUEST',
  'MISSING_API_KEY',
  'UPSTREAM_ERROR',
  'INVALID_JSON_FROM_LLM',
  'SCHEMA_VALIDATION_FAILED',
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
  if (args.raw !== undefined) {
    payload.raw = sanitizeRawForJson(args.raw, args.traceId);
  }
  return OracleResponseSchema.parse(payload);
}

function getHeader(req: any, name: string): string {
  const key = String(name).toLowerCase();
  const headers = (req?.headers ?? {}) as Record<string, unknown>;
  const v = headers[key];
  return v ? String(v) : '';
}

function coerceRequestBody(body: unknown): unknown {
  if (body === undefined || body === null) return {};

  if (typeof body === 'string') {
    const s = body.trim();
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return body;
    }
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(body)) {
    const s = body.toString('utf8').trim();
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }

  if (body instanceof Uint8Array) {
    const s = Buffer.from(body).toString('utf8').trim();
    if (!s) return {};
    try {
      return JSON.parse(s);
    } catch {
      return s;
    }
  }

  return body;
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

function getJsonRetryMax(structuredWanted: boolean, strictOn: boolean): number {
  const raw = String(process.env.GEMINI_JSON_RETRY_MAX ?? '').trim();
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return structuredWanted ? 2 : 1;
    return Math.max(0, Math.min(3, Math.floor(n)));
  }
  if (structuredWanted && strictOn) return 2;
  if (structuredWanted) return 1;
  return 1;
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

function pickFinalJsonSchema(mode: GeminiMode) {
  if (mode === 'oracle') return OracleJsonSchema;
  if (mode === 'guardian') return GuardianJsonSchema;
  return null;
}

function getErrorHttpStatus(code: string): number {
  if (code === 'INVALID_REQUEST') return 400;
  if (code === 'MISSING_API_KEY') return 500;
  if (code === 'UPSTREAM_ERROR') return 502;
  if (code === 'INTERNAL_ERROR') return 500;
  return 500;
}

function isOperationalJsonError(code: unknown): boolean {
  return (
    code === 'INVALID_REQUEST' ||
    code === 'MISSING_API_KEY' ||
    code === 'UPSTREAM_ERROR' ||
    code === 'INTERNAL_ERROR'
  );
}

function buildStrictDebugPreview(args: {
  baseResponse: any;
  finalState: any;
  violations: StrictViolation[];
}) {
  const response = args.baseResponse ?? {};
  const citations = Array.isArray(response?.citationsUsed)
    ? (response.citationsUsed as any[])
    : [];

  const sources = Array.from(
    new Set(citations.map(extractCitationSource).filter(Boolean)),
  );

  const knowledge = response?.knowledge ?? null;

  return {
    mode: response?.mode,
    model: response?.model,
    rawJsonError: args.finalState?.raw?.rawJsonError ?? null,
    finalJsonError: args.finalState?.finalJsonError ?? null,
    structured: Boolean(args.finalState?.raw?.structured === true),
    structuredUsed: Boolean(args.finalState?.structuredUsed === true),
    raw: response?.raw ?? undefined,
    citationsCount: citations.length,
    sources,
    citationsPreview: citations.slice(0, 6).map((c) => ({
      id: String(c?.id ?? ''),
      source: String(c?.source ?? ''),
    })),
    knowledge: knowledge
      ? {
          corpusLoaded: Boolean(knowledge.corpusLoaded),
          corpusHash: knowledge.corpusHash ?? null,
          integrityMode: knowledge.integrityMode ?? null,
        }
      : null,
    violations: args.violations.map((v) => v.code),
    textPreview: safeSlice(response?.text, 260),
    jsonPreview: safeJsonSlice(args.finalState?.finalJson, 900),
  };
}

export async function handleGeminiRequest(
  body: OracleRequest,
  deps: HandlerDeps = {},
): Promise<HandleResult> {
  const traceId = String(body.traceId ?? '').trim() || makeTraceId('srv');
  const modeInput = String((body as any).mode ?? '')
    .trim()
    .toLowerCase();
  const mode = normalizeMode(modeInput);

  const strictOn = isFailClosedStrictOn(mode);

  const envModel = normalizeModelName(process.env.GEMINI_MODEL);
  const clientModel = normalizeModelName((body as any).model);
  const model = envModel || clientModel || DEFAULT_MODEL;

  const expectJson =
    (body as any).expectJson === true || modeInput === 'json' || mode !== 'raw';

  const structuredOutputsOn = isStructuredOutputsOn();
  const structuredWanted =
    structuredOutputsOn &&
    expectJson &&
    (mode === 'oracle' || mode === 'guardian');

  const tempUser =
    mode === 'guardian'
      ? clampNumber((body as any).temperature, 0, 2, 0.1)
      : clampNumber(
          (body as any).temperature,
          0,
          2,
          mode === 'raw' ? 0.7 : 0.1,
        );

  const temperature = structuredWanted
    ? clampNumber(tempUser, 0, 0.2, 0.1)
    : tempUser;

  const topP = clampNumber((body as any).topP, 0, 1, 0.9);

  const maxOutputTokens =
    mode === 'oracle'
      ? Math.round(
          clampNumber(
            (body as any).maxOutputTokens,
            structuredWanted ? 1024 : 1,
            8192,
            1200,
          ),
        )
      : Math.round(
          clampNumber(
            (body as any).maxOutputTokens,
            structuredWanted ? 256 : 1,
            8192,
            600,
          ),
        );

  const timeoutMs = clampNumber(
    process.env.GEMINI_TIMEOUT_MS
      ? Number(process.env.GEMINI_TIMEOUT_MS)
      : (body as any).timeoutMs,
    1000,
    60000,
    25000,
  );

  const minCitations = getMinCitationsEffective(body, mode);

  const wantCitations =
    (body as any).wantCitations === true ||
    mode !== 'raw' ||
    shouldRequireCitations((body as any).prompt, (body as any).wantCitations);

  let citationsUsed: Citation[] = [];
  let outOfCorpus = false;
  let knowledgeError: string | null = null;

  let retrieveMs: number | undefined = undefined;

  if (wantCitations) {
    const t0 = Date.now();
    const query = buildRetrievalQuery(body, mode);
    outOfCorpus = isOutOfCorpusRequest(query);

    try {
      const kWanted = Math.max(minCitations, mode === 'oracle' ? 6 : 4);
      const k = Math.min(MAX_CITATIONS, Math.max(0, Math.floor(kWanted)));

      citationsUsed = retrieveZaraCitations(query, {
        k,
        traceId,
      });

      const leaked = citationsUsed.filter(
        (c: any) =>
          extractCitationSource(c) &&
          extractCitationSource(c) !== 'zarathoustra',
      );

      if (leaked.length > 0) {
        knowledgeError = knowledgeError ?? 'KNOWLEDGE_CORRUPTED';
        citationsUsed = citationsUsed.filter(
          (c: any) => extractCitationSource(c) === 'zarathoustra',
        );
      }
    } catch (err: any) {
      knowledgeError = err?.message
        ? String(err.message)
        : 'KNOWLEDGE_LOAD_FAILED';
      citationsUsed = [];
    } finally {
      retrieveMs = Math.max(0, Date.now() - t0);
    }

    if (citationsUsed.length < minCitations) {
      knowledgeError = knowledgeError ?? 'KNOWLEDGE_EMPTY';
    }
  }

  if (knowledgeError && mode !== 'raw') {
    logEvent('ERR', traceId, 'knowledge_error', { code: knowledgeError });

    const fallback =
      mode === 'oracle'
        ? safeOracleFallback(citationsUsed, outOfCorpus)
        : safeGuardianFallback();

    const json = applyCitationsToJson(fallback, citationsUsed);

    return {
      response: buildResponse({
        traceId,
        model,
        mode,
        text:
          typeof fallback?.quote === 'string'
            ? fallback.quote
            : (fallback.comment ?? 'Knowledge degraded.'),
        json,
        jsonError: knowledgeError,
        citationsUsed,
        raw: {
          structured: false,
          fallback: true,
          repairApplied: false,
          reason: knowledgeError,
          retryCount: 0,
        },
      }),
      retrieveMs,
      llmMs: undefined,
    };
  }

  let finalPrompt = '';

  if (mode === 'raw') {
    const prompt = sanitizeUserPrompt((body as any).prompt);
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
      ritual: (body as any).ritual,
      climateSnapshot: (body as any).climateSnapshot,
      prompt: (body as any).prompt,
      citations: citationsUsed,
      outOfCorpus,
    });
  } else {
    finalPrompt = buildGuardianPrompt({
      step: (body as any).step,
      value: (body as any).value,
      prompt: (body as any).prompt,
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

  logEvent('INFO', traceId, 'start', {
    mode,
    model,
    keySource: keyPick.source,
    cit: citationsUsed.length,
    minCit: minCitations,
    out: outOfCorpus ? 1 : 0,
    structured: structuredWanted ? 1 : 0,
    strict: strictOn ? 1 : 0,
    maxOutputTokens,
    temperature,
  });

  let llmMs: number | undefined = undefined;

  let call:
    | Awaited<ReturnType<typeof callGemini>>
    | Awaited<ReturnType<typeof callGeminiStructured>>;

  const retryMax = getJsonRetryMax(structuredWanted, strictOn);

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
      const temp = attempt === 0 ? temperature : 0;

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
    } else if (strictOn) {
      call = {
        ...(st as any),
        raw: {
          ...((st as any).raw ?? {}),
          retryCount,
          fallback: false,
          reason: (st as any)?.raw?.reason ?? 'STRUCTURED_FAILED',
        },
      } as any;
    } else {
      const rawAny = (st as any).raw ?? null;

      logEvent('WARN', traceId, 'structured_fallback', {
        status: (st as any)?.status,
        reason: rawAny?.reason ?? rawAny?.error ?? 'unknown',
        parseError: rawAny?.parseError ?? undefined,
        preview: rawAny?.parsedPreview ?? undefined,
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

  let json: unknown | null = null;
  let jsonErrorCode: string | null = null;
  let responseRaw = (call as any)?.raw ?? null;

  if (!call.ok) {
    const rawAny = (call as any).raw ?? null;
    const reason = rawAny?.reason ? String(rawAny.reason) : 'UPSTREAM_ERROR';

    logEvent('WARN', traceId, 'llm_call_failed', {
      status: (call as any).status,
      reason,
      msg: safeSlice((call as any).text),
      parseError: rawAny?.parseError ?? undefined,
      parseStage: rawAny?.parseStage ?? undefined,
    });

    const normalizedReason = normalizeJsonContractError(reason);
    const rawJsonError =
      rawAny?.rawJsonError != null
        ? normalizeJsonContractError(rawAny.rawJsonError)
        : normalizedReason;

    responseRaw = mergeRawMeta(rawAny, {
      rawJsonError: rawJsonError === 'UPSTREAM_ERROR' ? null : rawJsonError,
    });
    jsonErrorCode = normalizedReason;

    return {
      response: buildResponse({
        traceId,
        model,
        mode,
        text: String((call as any).text ?? ''),
        json: null,
        jsonError: jsonErrorCode,
        citationsUsed,
        raw: responseRaw,
      }),
      retrieveMs,
      llmMs,
    };
  }

  if (expectJson) {
    if (mode === 'oracle') {
      const parsed = parseOracleJson((call as any).text ?? '');
      json = parsed.json;
      jsonErrorCode = parsed.jsonError
        ? normalizeJsonContractError(parsed.jsonError)
        : null;
    } else if (mode === 'guardian') {
      const parsed = parseGuardianJson((call as any).text ?? '');
      json = parsed.json;
      jsonErrorCode = parsed.jsonError
        ? normalizeJsonContractError(parsed.jsonError)
        : null;
    } else {
      const parsed = tryParseJson((call as any).text ?? '');
      json = parsed.ok ? parsed.value : null;
      jsonErrorCode = parsed.ok ? null : 'INVALID_JSON_FROM_LLM';
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
    const rawMeta = normalizeRawContractMeta((call as any)?.raw);
    const finalJsonError =
      jsonErrorCode ?? rawMeta.rawJsonError ?? 'INVALID_JSON_FROM_LLM';

    logEvent('WARN', traceId, 'final_json_missing', {
      mode,
      code: finalJsonError,
      reason: rawMeta.reason ?? undefined,
      parseError: rawMeta.parseError ?? undefined,
    });

    responseRaw = mergeRawMeta((call as any)?.raw, {
      rawJsonError: normalizeJsonContractError(finalJsonError),
    });
    jsonErrorCode = normalizeJsonContractError(finalJsonError);
  }

  const raw = responseRaw ?? (call as any)?.raw ?? null;
  const rawMeta = normalizeRawContractMeta(raw);

  logEvent('INFO', traceId, 'done', {
    ms: llmMs,
    json: Boolean(json),
    rawStructured: rawMeta.structured ? 1 : 0,
    repaired: rawMeta.repairApplied ? 1 : 0,
    retryCount: rawMeta.retryCount,
    fallback: rawMeta.fallback ? 1 : 0,
    reason: rawMeta.reason ?? undefined,
    parseError: rawMeta.parseError ?? undefined,
    rawJsonError: rawMeta.rawJsonError ?? undefined,
  });

  return {
    response: buildResponse({
      traceId,
      model,
      mode,
      text: String((call as any).text ?? ''),
      json,
      jsonError: jsonErrorCode ?? rawMeta.rawJsonError,
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
    const incomingBody = coerceRequestBody(req?.body);
    const traceId = ensureTraceId(req, incomingBody as any);

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

      const parsed = OracleRequestSchema.safeParse(incomingBody ?? {});
      if (!parsed.success) {
        const flat = parsed.error.flatten();
        const issues = summarizeZodIssues(flat);

        const minCitationsOutOfRange = parsed.error.issues.some((i) => {
          const p0 = (i as any)?.path?.[0];
          return p0 === 'minCitations';
        });

        const message = minCitationsOutOfRange
          ? `minCitations must be between 0 and ${MAX_CITATIONS}`
          : 'Invalid request body';

        const payload = {
          ...buildApiErrorEnvelope(traceId, 'INVALID_BODY', message),
          issues: issues ?? undefined,
          maxCitations: MAX_CITATIONS,
        };

        respondJson(res, 400, payload, traceId);
        return;
      }

      const prompt = String((parsed.data as any).prompt ?? '').trim();
      if (!prompt) {
        const payload = buildApiErrorEnvelope(
          traceId,
          'INVALID_BODY',
          'prompt is required',
        );
        respondJson(res, 400, payload, traceId);
        return;
      }

      const body: OracleRequest = { ...(parsed.data as any), traceId };
      const result = await handleGeminiRequest(body, deps);

      const totalMs =
        typeof deps.forceTimingMs === 'number'
          ? deps.forceTimingMs
          : Math.max(0, Date.now() - startedAt);

      const baseResponse = (result.response ?? {}) as any;
      const baseJsonError = baseResponse?.jsonError ?? null;

      if (isOperationalJsonError(baseJsonError)) {
        const code = String(baseJsonError);
        const payload = buildApiErrorEnvelope(
          traceId,
          code,
          String(baseResponse?.text ?? code),
          totalMs,
          result.llmMs,
          result.retrieveMs,
        );
        respondJson(res, getErrorHttpStatus(code), payload, traceId);
        return;
      }

      const reqMode = normalizeMode(String((body as any).mode ?? ''));
      const minCitations = getMinCitationsEffective(body, reqMode);
      const finalSchema = pickFinalJsonSchema(reqMode);

      const finalState =
        reqMode === 'raw' || !finalSchema
          ? {
              mode: reqMode,
              finalJson: baseResponse?.json ?? null,
              finalJsonError: null,
              schemaValid: true,
              structuredUsed: false,
              raw: normalizeRawContractMeta(baseResponse?.raw),
              citationsUsed: Array.isArray(baseResponse?.citationsUsed)
                ? baseResponse.citationsUsed
                : [],
              knowledge: baseResponse?.knowledge,
            }
          : normalizeFinalState({
              mode: reqMode,
              schema: finalSchema as any,
              finalJsonCandidate: baseResponse?.json ?? null,
              raw: baseResponse?.raw,
              citationsUsed: Array.isArray(baseResponse?.citationsUsed)
                ? baseResponse.citationsUsed
                : [],
              knowledge: baseResponse?.knowledge,
            });

      const violations = isFailClosedStrictOn(reqMode)
        ? evaluateStrictInvariants(finalState as any, {
            minCitations,
            lockedSource: 'zarathoustra',
            structuredOutputsOn: isStructuredOutputsOn(),
          })
        : [];

      const citations = Array.isArray(baseResponse?.citationsUsed)
        ? baseResponse.citationsUsed
        : [];
      const sources = Array.from(
        new Set(citations.map(extractCitationSource).filter(Boolean)),
      );

      const payload = {
        ok: violations.length === 0,
        traceId,
        model: baseResponse?.model ?? '',
        mode: reqMode,
        text: String(baseResponse?.text ?? ''),
        json: finalState.finalJson,
        jsonError: finalState.finalJsonError,
        rawJsonError: finalState.raw.rawJsonError,
        finalJsonError: finalState.finalJsonError,
        citationsUsed: citations,
        knowledge: baseResponse?.knowledge,
        timings: {
          totalMs,
          llmMs: result.llmMs,
          retrieveMs: result.retrieveMs,
        },
        raw: {
          ...(baseResponse?.raw && typeof baseResponse.raw === 'object'
            ? baseResponse.raw
            : {}),
          structured: finalState.raw.structured,
          fallback: finalState.raw.fallback,
          repairApplied: finalState.raw.repairApplied,
          reason: finalState.raw.reason,
          parseError: finalState.raw.parseError,
          rawJsonError: finalState.raw.rawJsonError,
          retryCount: finalState.raw.retryCount,
        },
        meta: {
          mode: reqMode,
          minCitations,
          citationsCount: citations.length,
          sources,
          structuredOutputsOn: isStructuredOutputsOn(),
          structuredUsed: finalState.structuredUsed,
          rawStructured: finalState.raw.structured,
          fallback: finalState.raw.fallback,
          repairApplied: finalState.raw.repairApplied,
          rawJsonError: finalState.raw.rawJsonError,
          finalJsonError: finalState.finalJsonError,
          corpusLoaded: baseResponse?.knowledge?.corpusLoaded === true,
        },
        violations,
        debug: buildStrictDebugPreview({
          baseResponse,
          finalState,
          violations,
        }),
      };

      if (isContractGuardOn()) {
        const envelope = GeminiEnvelopeSchema.safeParse(payload);
        if (!envelope.success) {
          logEvent('ERR', traceId, 'contract_internal_inconsistency', {
            details: envelope.error.flatten(),
          });

          const errPayload = {
            ok: false,
            traceId,
            error: {
              code: 'CONTRACT_INTERNAL_INCONSISTENCY',
              message: 'Response envelope is internally inconsistent',
              details: envelope.error.flatten(),
            },
            timings: {
              totalMs,
              llmMs: result.llmMs,
              retrieveMs: result.retrieveMs,
            },
          };

          respondJson(res, 500, errPayload, traceId);
          return;
        }
      } else {
        const basicEnvelope = ApiEnvelopeSchema.safeParse({
          ...buildApiSuccessEnvelope(
            result.response,
            totalMs,
            result.llmMs,
            result.retrieveMs,
          ),
          jsonError: payload.jsonError,
        });

        if (!basicEnvelope.success) {
          logEvent('WARN', traceId, 'contract_warn', {
            code: 'CONTRACT_BROKEN',
          });
        }
      }

      if (isFailClosedStrictOn(reqMode) && violations.length > 0) {
        logEvent('ERR', traceId, 'strict_invariant_violation', {
          mode: reqMode,
          rawJsonError: finalState.raw.rawJsonError,
          finalJsonError: finalState.finalJsonError,
          structuredUsed: finalState.structuredUsed,
          violations: violations.map((v) => v.code),
        });

        respondJson(
          res,
          422,
          {
            ...payload,
            ok: false,
            error: {
              code: 'STRICT_INVARIANT_VIOLATION',
              message: 'Strict invariants violated (fail-closed).',
            },
          },
          traceId,
        );
        return;
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
