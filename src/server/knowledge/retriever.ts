import type { Citation } from '../contracts/oracle.types.js';
import { loadZaraSentences, type ZaraSentence } from './loadZarathoustra.js';

export const RETRIEVER_VERSION = '1.0.0';

const STOPWORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'de',
  'du',
  'd',
  'et',
  'ou',
  'mais',
  'donc',
  'or',
  'ni',
  'car',
  'a',
  'au',
  'aux',
  'avec',
  'sans',
  'sur',
  'sous',
  'dans',
  'pour',
  'par',
  'ce',
  'cet',
  'cette',
  'ces',
  'je',
  'tu',
  'il',
  'elle',
  'nous',
  'vous',
  'ils',
  'elles',
  'on',
  'me',
  'te',
  'se',
  'mon',
  'ton',
  'son',
  'ma',
  'ta',
  'sa',
  'mes',
  'tes',
  'ses',
  'notre',
  'votre',
  'leurs',
  'qui',
  'que',
  'quoi',
  'dont',
  'est',
  'sont',
  'etre',
  'ete',
  'avoir',
  'fait',
  'faites',
  'plus',
  'moins',
  'tres',
]);

const OUT_OF_CORPUS_RE =
  /(wikipedia|wiki|google|web|internet|browser|source|sources|reference|refs|liens?|links?)/i;

export function isOutOfCorpusRequest(input: string): boolean {
  return OUT_OF_CORPUS_RE.test(String(input ?? ''));
}

function normalize(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(input: string): string[] {
  const n = normalize(input);
  return n
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let c = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    c += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return c;
}

function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function toCitation(s: ZaraSentence, score: number): Citation {
  return {
    id: String(s.id),
    text: String(s.text ?? ''),
    part_title: s.part_title ? String(s.part_title) : undefined,
    section_title: s.section_title ? String(s.section_title) : undefined,
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t)) : undefined,
    score,
    source: 'zarathoustra',
  };
}

export type RetrieveOpts = {
  k?: number;
  traceId?: string;
  sentences?: ZaraSentence[];
};

export function retrieveZaraCitations(query: string, opts?: RetrieveOpts): Citation[] {
  const sentences = opts?.sentences ?? loadZaraSentences();
  const k = Math.max(2, Math.min(opts?.k ?? 5, 12));
  const tokens = tokenize(String(query ?? ''));
  const tokenSet = new Set(tokens);
  const phrase = normalize(String(query ?? ''));

  const scored = sentences.map((s) => {
    const text = normalize(String(s.text ?? ''));
    let score = 0;

    for (const t of tokens) score += countOccurrences(text, t);

    if (Array.isArray(s.tags)) {
      for (const tag of s.tags) {
        const normTag = normalize(String(tag));
        if (normTag && tokenSet.has(normTag)) score += 2;
      }
    }

    if (phrase && text.includes(phrase)) score += 3;

    return { s, score };
  });

  const hasSignal = scored.some((x) => x.score > 0);
  const candidates = hasSignal ? scored.filter((x) => x.score > 0) : scored;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return compareIds(String(a.s.id), String(b.s.id));
  });

  return candidates.slice(0, Math.min(k, candidates.length)).map(({ s, score }) => toCitation(s, score));
}
