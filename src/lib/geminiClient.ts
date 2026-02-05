export type GeminiGenerateOptions = {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  traceId?: string;

  // NEW
  expectJson?: boolean;
};

export type GeminiGenerateResult = {
  text: string;
  raw?: unknown;
  json?: unknown;
  jsonError?: string | null;
};

type GeminiJsonResponse =
  | {
      text?: unknown;
      json?: unknown;
      jsonError?: unknown;
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
  const traceId = (opts.traceId ?? makeTraceId('dbg')).trim();

  const payload: Record<string, unknown> = {
    traceId,
    prompt,
    temperature: opts.temperature ?? 0.6,
    topP: opts.topP ?? 0.9,
    maxOutputTokens: opts.maxOutputTokens ?? 600,
  };

  if (opts.model && String(opts.model).trim().length > 0)
    payload.model = String(opts.model).trim();
  if (opts.expectJson === true) payload.expectJson = true;

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
      `[${traceId}] Réponse inattendue depuis /api/gemini: content-type="${ct || 'inconnu'}".${hint}`,
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

  const text =
    (data?.text as unknown) ?? (data as any)?.output ?? JSON.stringify(data);

  return {
    text: String(text ?? ''),
    raw: data,
    json: (data as any)?.json,
    jsonError: (data as any)?.jsonError ?? null,
  };
}
