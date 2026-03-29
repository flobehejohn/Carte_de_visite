export type GeminiMode = 'raw' | 'oracle' | 'guardian';

export type GeminiGenerateOptions = {
  mode?: GeminiMode;

  // raw
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  traceId?: string;
  expectJson?: boolean;

  // oracle/guardian
  ritual?: unknown;
  climateSnapshot?: unknown;
  step?: string;
  value?: string;
};

export type GeminiGenerateResult = {
  text: string;
  raw?: unknown;
  json?: unknown;
  jsonError?: string | null;
  traceId: string;
  model?: string;
  mode?: GeminiMode;
};

type GeminiJsonResponse =
  | {
      text?: unknown;
      json?: unknown;
      jsonError?: unknown;
      traceId?: unknown;
      model?: unknown;
      mode?: unknown;
      error?: unknown;
      message?: unknown;
    }
  | Record<string, unknown>;

const API_PATH = '/api/gemini';

type GeminiClientErrorKind =
  | 'network_error'
  | 'api_response_error'
  | 'unexpected_content_type';

function resolveApiUrl(path: string): string {
  const maybeWindow = globalThis as typeof globalThis & {
    location?: { origin?: string };
  };
  if (maybeWindow.location?.origin) {
    try {
      return new URL(path, maybeWindow.location.origin).toString();
    } catch {
      return path;
    }
  }
  return path;
}

function getBodyExcerpt(data: unknown, max = 220): string {
  if (typeof data === 'string') return data.slice(0, max);
  if (!data) return '';
  try {
    return JSON.stringify(data).slice(0, max);
  } catch {
    return String(data).slice(0, max);
  }
}

function extractErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim().length > 0) {
    return data;
  }

  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const error = record?.error;

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    const errorMessage = String(errorRecord.message ?? '').trim();
    const errorCode = String(errorRecord.code ?? '').trim();
    if (errorMessage) {
      return errorCode ? `${errorCode}: ${errorMessage}` : errorMessage;
    }
    if (errorCode) return errorCode;
  }

  const message = String(record?.message ?? '').trim();
  if (message) return message;

  return `Erreur API Gemini (status ${status})`;
}

function extractErrorCode(data: unknown): string | null {
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  const error = record?.error;

  if (error && typeof error === 'object') {
    const code = String((error as Record<string, unknown>).code ?? '').trim();
    if (code) return code;
  }

  return null;
}

function isDevRuntime(): boolean {
  const meta = import.meta as ImportMeta & {
    env?: { DEV?: boolean };
  };
  return Boolean(meta.env?.DEV);
}

function logGeminiClientError(args: {
  url: string;
  status?: number;
  contentType?: string;
  bodyExcerpt?: string;
  traceId: string;
  kind: GeminiClientErrorKind;
  apiCode?: string | null;
  message: string;
}): void {
  if (!isDevRuntime()) return;

  const statusPart =
    typeof args.status === 'number' ? ` status=${args.status}` : '';
  const ctPart = args.contentType ? ` content-type=${args.contentType}` : '';
  const apiCodePart = args.apiCode ? ` apiCode=${args.apiCode}` : '';
  const bodyPart = args.bodyExcerpt ? ` body=${args.bodyExcerpt}` : '';
  // eslint-disable-next-line no-console
  console.error(
    `[geminiClient] kind=${args.kind} traceId=${args.traceId} url=${args.url}${statusPart}${ctPart}${apiCodePart} ${args.message}${bodyPart}`.trim(),
  );
}

function makeTraceId(prefix = 'trc'): string {
  const g = globalThis as any;
  const uuid = g?.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.length > 0) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function geminiGenerate(
  prompt: string,
  opts: GeminiGenerateOptions = {},
): Promise<GeminiGenerateResult> {
  const traceId = (opts.traceId ?? makeTraceId('ui')).trim();
  const url = resolveApiUrl(API_PATH);

  const payload: Record<string, unknown> = {
    traceId,
    mode: opts.mode ?? 'raw',
    prompt,
    temperature: opts.temperature ?? 0.6,
    topP: opts.topP ?? 0.9,
    maxOutputTokens: opts.maxOutputTokens ?? 600,
  };

  if (opts.model && String(opts.model).trim().length > 0)
    payload.model = String(opts.model).trim();
  if (opts.expectJson === true) payload.expectJson = true;

  if (opts.ritual !== undefined) payload.ritual = opts.ritual;
  if (opts.climateSnapshot !== undefined)
    payload.climateSnapshot = opts.climateSnapshot;
  if (opts.step) payload.step = opts.step;
  if (opts.value) payload.value = opts.value;

  let r: Response;
  try {
    r = await fetch(API_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: opts.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'fetch /api/gemini failed';
    logGeminiClientError({
      url,
      traceId,
      kind: 'network_error',
      message,
    });
    throw error;
  }

  const ct = r.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  const bodyText = isJson ? null : await r.text().catch(() => '');
  const bodyJson = isJson ? await r.json().catch(() => null) : null;

  if (r.ok && !isJson) {
    const hint = bodyText
      ? ` (extrait: ${String(bodyText).slice(0, 160)})`
      : '';
    logGeminiClientError({
      url,
      status: r.status,
      contentType: ct || 'inconnu',
      bodyExcerpt: getBodyExcerpt(bodyText),
      traceId,
      kind: 'unexpected_content_type',
      message: 'unexpected non-JSON success response',
    });
    throw new Error(
      `[${traceId}] Reponse inattendue /api/gemini: content-type="${ct || 'inconnu'}".${hint}`,
    );
  }

  if (!r.ok) {
    const data = (bodyJson ?? bodyText) as unknown;
    const responseTraceId = String(
      (bodyJson as GeminiJsonResponse | null)?.traceId ?? traceId,
    );
    const apiCode = extractErrorCode(data);
    const msg = extractErrorMessage(data, r.status);
    logGeminiClientError({
      url,
      status: r.status,
      contentType: ct || 'inconnu',
      bodyExcerpt: getBodyExcerpt(data),
      traceId: responseTraceId,
      kind: 'api_response_error',
      apiCode,
      message: msg,
    });
    throw new Error(`[${responseTraceId}] ${msg}`);
  }

  const data = (bodyJson ?? {}) as GeminiJsonResponse;

  return {
    text: String((data as any)?.text ?? ''),
    raw: data,
    json: (data as any)?.json,
    jsonError: (data as any)?.jsonError ?? null,
    traceId: String((data as any)?.traceId ?? traceId),
    model: (data as any)?.model ? String((data as any)?.model) : undefined,
    mode: (data as any)?.mode ?? opts.mode ?? 'raw',
  };
}
