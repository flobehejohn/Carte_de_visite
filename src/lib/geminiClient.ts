export type GeminiGenerateOptions = {
  model?: string;
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export type GeminiGenerateResult = {
  text: string;
  raw?: unknown;
};

export async function geminiGenerate(
  prompt: string,
  opts: GeminiGenerateOptions = {}
): Promise<GeminiGenerateResult> {
  const payload = {
    prompt,
    model: opts.model ?? "gemini-1.5-flash",
    temperature: opts.temperature ?? 0.6,
    topP: opts.topP ?? 0.9,
    maxOutputTokens: opts.maxOutputTokens ?? 600,
  };

  const r = await fetch("/api/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  const ct = r.headers.get("content-type") ?? "";
  const data = ct.includes("application/json") ? await r.json() : await r.text();

  if (!r.ok) {
    const msg =
      typeof data === "string"
        ? data
        : (data?.error ?? data?.message ?? "Erreur API Gemini");
    throw new Error(msg);
  }

  const text =
    typeof data === "string"
      ? data
      : (data?.text ?? data?.output ?? JSON.stringify(data));

  return { text: String(text ?? ""), raw: data };
}
