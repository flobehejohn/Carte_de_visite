import fs from 'node:fs';

import { assertZaraFilesPresent, resolveZaraPath, ZARA_FILES } from '../config/zarathoustra.js';

export type ZaraSentence = {
  id: string | number;
  text: string;
  tags?: string[];
  part_title?: string;
  section_title?: string;
  [k: string]: unknown;
};

let cacheSentences: ZaraSentence[] | null = null;

export function loadZaraSentences(): ZaraSentence[] {
  if (cacheSentences) return cacheSentences;

  assertZaraFilesPresent();
  const p = resolveZaraPath(ZARA_FILES.sentencesTagged);
  const raw = fs.readFileSync(p, 'utf-8');
  const data = JSON.parse(raw) as unknown;

  if (!Array.isArray(data)) {
    throw new Error(`Zara knowledge invalid (expected array) at ${p}`);
  }

  cacheSentences = data as ZaraSentence[];
  return cacheSentences;
}
