import fs from 'node:fs';

import { assertZaraFilesPresent, resolveZaraPath, ZARA_FILES } from '../config/zarathoustra.js';

export type ZaraSentence = {
  id: string;
  text: string;
  tags: string[];
  part_title?: string;
  section_title?: string;
  [k: string]: unknown;
};

const MIN_SENTENCE_COUNT = 1000;

let cacheSentences: ZaraSentence[] | null = null;

function coerceString(v: unknown): string {
  return String(v ?? '').trim();
}

function normalizeSentence(raw: any, idx: number): ZaraSentence {
  const idRaw = raw?.id ?? raw?.ID ?? null;
  const id = coerceString(idRaw) || `auto_${idx + 1}`;

  const text = coerceString(raw?.text);
  if (!text) {
    throw new Error(`CRITICAL: Zarathoustra corpus corrupted (empty text at index ${idx})`);
  }

  const tagsRaw = raw?.tags;
  if (!Array.isArray(tagsRaw)) {
    throw new Error(`CRITICAL: Zarathoustra corpus corrupted (tags missing at index ${idx})`);
  }

  const tags = tagsRaw.map((t) => coerceString(t)).filter((t) => t.length > 0);

  const sentence: ZaraSentence = {
    ...(raw ?? {}),
    id,
    text,
    tags,
  };

  if (raw?.part_title != null) sentence.part_title = coerceString(raw.part_title);
  if (raw?.section_title != null) sentence.section_title = coerceString(raw.section_title);

  return sentence;
}

export function loadZaraSentences(): ZaraSentence[] {
  if (cacheSentences) return cacheSentences;

  assertZaraFilesPresent();
  const p = resolveZaraPath(ZARA_FILES.sentencesTagged);
  const raw = fs.readFileSync(p, 'utf-8');
  const data = JSON.parse(raw) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`Zarathoustra knowledge invalid (expected array) at ${p}`);
  }

  const out: ZaraSentence[] = [];
  for (let i = 0; i < data.length; i += 1) {
    out.push(normalizeSentence(data[i], i));
  }

  if (out.length < MIN_SENTENCE_COUNT) {
    throw new Error(
      `CRITICAL: Zarathoustra corpus corrupted (size ${out.length} < ${MIN_SENTENCE_COUNT})`,
    );
  }

  cacheSentences = out;
  return cacheSentences;
}
