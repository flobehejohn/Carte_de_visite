export type GeminiCallArgs = {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  timeoutMs: number;
  traceId: string;
};

export type GeminiCallResult = {
  ok: boolean;
  status: number;
  raw: any;
  text: string;
  ms: number;
};

export async function callGemini(args: GeminiCallArgs): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.model,
  )}:generateContent?key=${encodeURIComponent(args.key)}`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), args.timeoutMs);

  const start = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: args.prompt }] }],
        generationConfig: {
          temperature: args.temperature,
          topP: args.topP,
          maxOutputTokens: args.maxOutputTokens,
        },
      }),
    });

    const raw = (await r.json().catch(() => null)) as any;
    const text =
      raw?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p?.text ?? '')
        .join('') ?? '';
    const ms = Date.now() - start;

    return { ok: r.ok, status: r.status, raw, text, ms };
  } finally {
    clearTimeout(t);
  }
}
