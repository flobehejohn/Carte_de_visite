import fs from 'node:fs';
import path from 'node:path';

export const ZARA_KNOWLEDGE_DIR = path.join(
  process.cwd(),
  'src',
  'server',
  'knowledge',
);

export const ZARA_FILES = {
  sentencesTagged: 'zarathoustra.sentences.tagged.json',
  sentences: 'zarathoustra.sentences.json',
  structure: 'zarathoustra.structure.json',
  cleanText: 'zarathoustra.clean.txt',
  rawText: 'zarathoustra.txt',
  manifest: 'zarathoustra.manifest.json',
};

export function resolveZaraPath(fileName: string): string {
  return path.join(ZARA_KNOWLEDGE_DIR, fileName);
}

export function assertZaraFilesPresent(): void {
  const required = [
    ZARA_FILES.sentencesTagged,
    ZARA_FILES.structure,
    ZARA_FILES.cleanText,
    ZARA_FILES.rawText,
    ZARA_FILES.manifest,
  ];

  for (const name of required) {
    const p = resolveZaraPath(name);
    if (!fs.existsSync(p)) {
      throw new Error(`Zarathoustra corpus missing: ${p}`);
    }
  }
}
