type Body = {
  traceId?: string;
  prompt?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;

  // NEW: si true, on tente d'extraire/parsers du JSON depuis la réponse
  expectJson?: boolean;
};

function clampNumber(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, v));
}

function normalizeModelName(v?: string): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.startsWith('models/') ? s.slice('models/'.length) : s;
}

function getTraceId(body: Body): string {
  const t = String(body?.traceId ?? '').trim();
  if (t) return t;
  return `srv_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function stripCodeFences(s: string): string {
  const t = String(s ?? '').trim();
  // ```json ... ```
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) return m[1].trim();
  return t;
}

function tryParseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const candidate = stripCodeFences(text);

  // 1) parse direct
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {}

  // 2) fallback : tente d'extraire un objet {...} ou tableau [...]
  const obj = candidate.match(/\{[\s\S]*\}/);
  if (obj?.[0]) {
    try {
      return { ok: true, value: JSON.parse(obj[0]) };
    } catch {}
  }
  const arr = candidate.match(/\[[\s\S]*\]/);
  if (arr?.[0]) {
    try {
      return { ok: true, value: JSON.parse(arr[0]) };
    } catch {}
  }

  return { ok: false, error: 'JSON.parse failed (no valid JSON detected)' };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const body = (req.body ?? {}) as Body;
  const traceId = getTraceId(body);

  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    res.setHeader('cache-control', 'no-store');
    res
      .status(500)
      .json({
        error: 'Missing GEMINI_API_KEY (or GOOGLE_API_KEY) on server.',
        traceId,
      });
    return;
  }

  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) {
    res.setHeader('cache-control', 'no-store');
    res.status(400).json({ error: 'prompt is required', traceId });
    return;
  }

  const temperature = clampNumber(body.temperature, 0, 2, 0.6);
  const topP = clampNumber(body.topP, 0, 1, 0.9);
  const maxOutputTokens = Math.round(
    clampNumber(body.maxOutputTokens, 1, 8192, 600),
  );

  const envModel = normalizeModelName(process.env.GEMINI_MODEL);
  const clientModel = normalizeModelName(body.model);
  const model = envModel || clientModel || 'gemini-2.5-flash';

  const expectJson = Boolean(body.expectJson);

  // Si on veut du JSON, on renforce l’instruction (sans casser les usages texte)
  const finalPrompt = expectJson
    ? [
        'IMPORTANT: Réponds UNIQUEMENT avec du JSON valide. Aucun texte hors JSON. Aucun Markdown. Aucun ```.',
        prompt,
      ].join('\n\n')
    : prompt;

  console.log(
    `[api/gemini][${traceId}] start model=${model} json=${expectJson}`,
  );

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(key)}`;

  const controller = new AbortController();
  const timeoutMs = clampNumber(
    process.env.GEMINI_TIMEOUT_MS
      ? Number(process.env.GEMINI_TIMEOUT_MS)
      : undefined,
    1000,
    60000,
    25000,
  );
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
        generationConfig: { temperature, topP, maxOutputTokens },
      }),
    });

    const data = await r.json().catch(() => null);

    res.setHeader('cache-control', 'no-store');

    if (!r.ok) {
      const msg = data?.error?.message ?? 'Gemini API error';
      console.warn(
        `[api/gemini][${traceId}] upstream_error status=${r.status} msg=${msg}`,
      );
      res.status(r.status).json({ error: msg, traceId, model, raw: data });
      return;
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('') ?? '';

    let json: unknown = null;
    let jsonError: string | null = null;

    if (expectJson) {
      const parsed = tryParseJson(text);
      if (parsed.ok) json = parsed.value;
      else jsonError = parsed.error;
    }

    res.status(200).json({
      text: String(text ?? ''),
      json,
      jsonError,
      traceId,
      model,
      raw: data,
    });
  } catch (e: any) {
    const aborted = e?.name === 'AbortError';
    const msg = aborted
      ? `Gemini request timeout after ${timeoutMs}ms`
      : (e?.message ?? 'Server error');
    console.error(
      `[api/gemini][${traceId}] exception aborted=${aborted} msg=${msg}`,
    );
    res.setHeader('cache-control', 'no-store');
    res.status(aborted ? 504 : 500).json({ error: msg, traceId, model });
  } finally {
    clearTimeout(t);
  }
}
