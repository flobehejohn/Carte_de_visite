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

  const r = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  const ct = r.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  const bodyText = isJson ? null : await r.text().catch(() => '');
  const bodyJson = isJson ? await r.json().catch(() => null) : null;

  if (r.ok && !isJson) {
    const hint = bodyText
      ? ` (extrait: ${String(bodyText).slice(0, 160)})`
      : '';
    throw new Error(
      `[${traceId}] Reponse inattendue /api/gemini: content-type="${ct || 'inconnu'}".${hint}`,
    );
  }

  if (!r.ok) {
    const data = (bodyJson ?? bodyText) as unknown;
    const msg =
      typeof data === 'string'
        ? data
        : ((data as GeminiJsonResponse | null)?.error ??
          (data as GeminiJsonResponse | null)?.message ??
          `Erreur API Gemini (status ${r.status})`);
    throw new Error(`[${traceId}] ${String(msg)}`);
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
