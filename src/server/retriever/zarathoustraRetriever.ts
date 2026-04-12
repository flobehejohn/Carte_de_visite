import type { Citation } from '../contracts/oracleContracts.js';
import { loadZaraSentences, type ZaraSentence } from '../knowledge/loadZarathoustra.js';

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

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ');
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

function toCitation(s: ZaraSentence, score?: number): Citation {
  return {
    id: s.id,
    text: String(s.text ?? ''),
    part_title: s.part_title ? String(s.part_title) : undefined,
    section_title: s.section_title ? String(s.section_title) : undefined,
    tags: Array.isArray(s.tags) ? s.tags.map((t) => String(t)) : undefined,
    score,
  };
}

export type RetrieveOpts = {
  k?: number;
  traceId?: string;
};

export function retrieveZaraCitations(
  query: string,
  opts?: RetrieveOpts,
): Citation[] {
  const sentences = loadZaraSentences();
  const k = Math.max(1, Math.min(opts?.k ?? 6, 12));
  const tokens = tokenize(String(query ?? ''));

  if (tokens.length === 0) {
    return sentences.slice(0, Math.min(k, sentences.length)).map((s) =>
      toCitation(s, 0),
    );
  }

  const scored: Array<{ s: ZaraSentence; score: number }> = [];
  for (const s of sentences) {
    const text = normalize(String(s.text ?? ''));
    let score = 0;
    for (const t of tokens) score += countOccurrences(text, t);
    if (score > 0) scored.push({ s, score });
  }

  if (scored.length === 0) {
    return sentences.slice(0, Math.min(k, sentences.length)).map((s) =>
      toCitation(s, 0),
    );
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map(({ s, score }) => toCitation(s, score));
}
