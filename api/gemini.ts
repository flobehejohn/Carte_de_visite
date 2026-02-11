import { OracleRequestSchema, OracleResponseSchema } from '../src/server/contracts/oracle.schemas.js';
import type { Citation, OracleRequest, OracleResponse } from '../src/server/contracts/oracle.types.js';
import { getKnowledgeHealth } from '../src/server/knowledge/health.js';
import { isOutOfCorpusRequest, retrieveZaraCitations } from '../src/server/knowledge/retriever.js';
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
import { clampNumber, makeTraceId, safeLog } from '../src/server/observability/trace.js';

type GeminiMode = 'raw' | 'oracle' | 'guardian';

type HandlerDeps = {
  callGeminiImpl?: typeof callGemini;
};

const DEFAULT_MODEL = 'gemini-2.5-flash';

function normalizeModelName(v?: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function normalizeMode(v?: string): GeminiMode {
  const m = String(v ?? '').trim().toLowerCase();
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
    jsonError: args.jsonError,
    citationsUsed: args.citationsUsed,
    knowledge,
  };
  if (args.raw !== undefined) payload.raw = args.raw;
  return OracleResponseSchema.parse(payload);
}

export async function handleGeminiRequest(
  body: OracleRequest,
  deps: HandlerDeps = {},
): Promise<OracleResponse> {
  const traceId = String(body.traceId ?? '').trim() || makeTraceId('srv');
  const modeInput = String(body.mode ?? '').trim().toLowerCase();
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
    body.wantCitations === true || mode !== 'raw' || shouldRequireCitations(body.prompt, body.wantCitations);

  let citationsUsed: Citation[] = [];
  let outOfCorpus = false;
  let knowledgeError: string | null = null;

  if (wantCitations) {
    const query = buildRetrievalQuery(body, mode);
    outOfCorpus = isOutOfCorpusRequest(query);
    try {
      citationsUsed = retrieveZaraCitations(query, {
        k: mode === 'oracle' ? 6 : 4,
        traceId,
      });
    } catch (err: any) {
      knowledgeError = err?.message ? String(err.message) : 'KNOWLEDGE_LOAD_FAILED';
      citationsUsed = [];
    }

    if (citationsUsed.length < 2) {
      knowledgeError = knowledgeError ?? 'KNOWLEDGE_EMPTY';
    }
  }

  if (knowledgeError && mode !== 'raw') {
    const knowledgeErrorCode =
      knowledgeError.indexOf('CRITICAL') >= 0 ? 'KNOWLEDGE_CORRUPTED' : 'KNOWLEDGE_EMPTY';
    safeLog('ERR', traceId, 'knowledge_error', { msg: knowledgeError });
    const fallback =
      mode === 'oracle'
        ? safeOracleFallback(citationsUsed, outOfCorpus)
        : safeGuardianFallback();
    const json =
      mode === 'oracle' || mode === 'guardian'
        ? applyCitationsToJson(fallback, citationsUsed)
        : null;
    return buildResponse({
      traceId,
      model,
      mode,
      text: typeof fallback?.quote === 'string' ? fallback.quote : 'Oracle disconnected.',
      json,
      jsonError: knowledgeErrorCode,
      citationsUsed,
    });
  }

  let finalPrompt = '';
  if (mode === 'raw') {
    const prompt = sanitizeUserPrompt(body.prompt);
    if (!prompt) {
      return buildResponse({
        traceId,
        model,
        mode,
        text: 'prompt is required',
        json: null,
        jsonError: 'INVALID_REQUEST',
        citationsUsed,
      });
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

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return buildResponse({
      traceId,
      model,
      mode,
      text: 'Missing GEMINI_API_KEY (or GOOGLE_API_KEY) on server.',
      json: null,
      jsonError: 'MISSING_API_KEY',
      citationsUsed,
    });
  }

  safeLog('INFO', traceId, 'start', {
    mode,
    model,
    cit: citationsUsed.length,
    out: outOfCorpus ? 1 : 0,
  });

  const call = await (deps.callGeminiImpl ?? callGemini)({
    key,
    model,
    prompt: finalPrompt,
    temperature,
    topP,
    maxOutputTokens,
    timeoutMs,
    traceId,
  });

  if (!call.ok) {
    const msg = call.raw?.error?.message ?? 'Gemini API error';
    safeLog('WARN', traceId, 'upstream_error', { status: call.status, msg });
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
    return buildResponse({
      traceId,
      model,
      mode,
      text: typeof fallback?.quote === 'string' ? fallback.quote : String(call.text ?? ''),
      json,
      jsonError: 'UPSTREAM_ERROR',
      citationsUsed,
      raw: call.raw,
    });
  }

  let json: unknown | null = null;
  let jsonError: string | null = null;

  if (expectJson) {
    if (mode === 'oracle') {
      const parsed = parseOracleJson(call.text ?? '');
      json = parsed.json;
      jsonError = parsed.jsonError ? 'INVALID_JSON_FROM_LLM' : null;
    } else if (mode === 'guardian') {
      const parsed = parseGuardianJson(call.text ?? '');
      json = parsed.json;
      jsonError = parsed.jsonError ? 'INVALID_JSON_FROM_LLM' : null;
    } else {
      const parsed = tryParseJson(call.text ?? '');
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

  safeLog('INFO', traceId, 'done', {
    ms: call.ms,
    json: Boolean(json),
    err: Boolean(jsonError),
  });

  return buildResponse({
    traceId,
    model,
    mode,
    text: String(call.text ?? ''),
    json,
    jsonError,
    citationsUsed,
    raw: call.raw,
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const parsed = OracleRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const traceId = makeTraceId('srv');
    res.setHeader('cache-control', 'no-store');
    res.status(400).json({
      error: 'Invalid request body',
      traceId,
      details: parsed.error.flatten(),
    });
    return;
  }

  const response = await handleGeminiRequest(parsed.data);
  res.setHeader('cache-control', 'no-store');
  res.status(200).json(response);
}
