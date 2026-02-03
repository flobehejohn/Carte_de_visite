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

type GeminiJsonResponse =
  | { text?: unknown; output?: unknown; error?: unknown; message?: unknown }
  | Record<string, unknown>;

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
  const isJson = ct.includes("application/json");

  // Lecture du body : JSON si possible, sinon texte brut (utile pour messages d'erreur)
  const bodyText = isJson ? null : await r.text().catch(() => "");
  const bodyJson = isJson ? await r.json().catch(() => null) : null;

  // Fail-fast : un 200 avec HTML/text => très souvent un rewrite SPA ou une mauvaise route API.
  if (r.ok && !isJson) {
    const hint = bodyText ? ` (extrait: ${String(bodyText).slice(0, 120)})` : "";
    throw new Error(
      `Réponse inattendue depuis /api/gemini: content-type="${ct || "inconnu"}" (JSON attendu).${hint}`
    );
  }

  // Erreur HTTP : on autorise les erreurs non-JSON (texte) pour afficher un message utile
  if (!r.ok) {
    const data = (bodyJson ?? bodyText) as unknown;

    const msg =
      typeof data === "string"
        ? data
        : ((data as GeminiJsonResponse | null)?.error ??
            (data as GeminiJsonResponse | null)?.message ??
            `Erreur API Gemini (status ${r.status})`);

    throw new Error(String(msg));
  }

  // Succès : JSON garanti ici (cf fail-fast)
  const data = (bodyJson ?? {}) as GeminiJsonResponse;

  const text =
    (data?.text as unknown) ??
    (data?.output as unknown) ??
    JSON.stringify(data);

  return { text: String(text ?? ""), raw: data };
}
