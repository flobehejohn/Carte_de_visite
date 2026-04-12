import fs from 'node:fs';

import { resolveZaraPath, ZARA_FILES } from '../config/zarathoustra.js';
import { loadZaraSentences, type ZaraSentence } from './loadZarathoustra.js';

export type ZaraCorpus = {
  sentences: ZaraSentence[];
  corpusHash?: string;
  manifestVersion?: string;
  integrityMode: 'manifest' | 'none';
};

let cache: ZaraCorpus | null = null;

function readManifestMeta(): { corpusHash?: string; manifestVersion?: string } {
  try {
    const p = resolveZaraPath(ZARA_FILES.manifest);
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf-8');
    const manifest = JSON.parse(raw) as any;
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    const entry = files.find((f: any) => String(f?.name) === ZARA_FILES.sentencesTagged);
    const corpusHash = entry?.sha256 ? String(entry.sha256) : undefined;
    const manifestVersion = manifest?.generatedAt ? String(manifest.generatedAt) : undefined;
    return { corpusHash, manifestVersion };
  } catch {
    return {};
  }
}

export function getZaraCorpus(): ZaraCorpus {
  if (cache) return cache;
  const sentences = loadZaraSentences();
  const meta = readManifestMeta();
  cache = {
    sentences,
    corpusHash: meta.corpusHash,
    manifestVersion: meta.manifestVersion,
    integrityMode: meta.corpusHash ? 'manifest' : 'none',
  };
  return cache;
}

export function getCorpusSize(): number {
  return getZaraCorpus().sentences.length;
}
