// ASCII-only comments & strings (safe for tooling)

export type GuardResult = {
  isEnglishLikely: boolean;
  score: number;
  hits: number;
  tokens: number;
};

const COMMON_EN = new Set([
  'the','and','with','you','your','this','that','are','for','from','have','not','but','what','when','then','will',
  'can','could','should','into','over','under','just','like','about','more','less','very','really','because','if',
  'they','them','their','we','our','i','me','my','a','an','to','of','in','on','at','as','is','was','were','be'
]);

function tokenize(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    // lettres latines + accents + apostrophe + espace + tiret
    .replace(/[^a-zA-Z\u00c0-\u017f' -]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);
}

export function analyzeEnglishLikelihood(text: string): GuardResult {
  const toks = tokenize(text || '');
  const tokens = toks.length || 0;
  if (tokens === 0) return { isEnglishLikely: false, score: 0, hits: 0, tokens: 0 };

  let hits = 0;
  for (const t of toks) if (COMMON_EN.has(t)) hits += 1;

  // ratio of frequent EN words among tokens
  const score = hits / tokens;

  // Heuristic threshold:
  // - short text: be lenient
  // - longer text: stricter
  const threshold = tokens < 25 ? 0.22 : 0.14;
  const isEnglishLikely = score >= threshold;

  return { isEnglishLikely, score, hits, tokens };
}

export class ZaraLangGuard {
  private lastLogMs = 0;

  constructor(private debug = false) {}

  shouldRetry(text: string): boolean {
    const r = analyzeEnglishLikelihood(text);
    if (this.debug) {
      this.throttledLog(
        `[ZaraLangGuard] score=${r.score.toFixed(3)} hits=${r.hits}/${r.tokens}`
      );
    }
    return r.isEnglishLikely;
  }

  private throttledLog(msg: string) {
    const now = Date.now();
    if (now - this.lastLogMs < 1200) return;
    this.lastLogMs = now;

    console.info(msg);
  }
}
