import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TEXT_EXTENSIONS = new Set([
  '.json',
  '.txt',
  '.log',
  '.md',
  '.csv',
  '.tsv',
  '.yml',
  '.yaml',
]);

function isTextLikeFile(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function canonicalBuffer(filePath: string): Buffer {
  const raw = fs.readFileSync(filePath);

  if (!isTextLikeFile(filePath)) {
    return raw;
  }

  let text = raw.toString('utf8');

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  text = text.replace(/\r\n?/g, '\n');

  return Buffer.from(text, 'utf8');
}

function sha256Canonical(filePath: string): string {
  return crypto
    .createHash('sha256')
    .update(canonicalBuffer(filePath))
    .digest('hex');
}

describe('Zarathoustra knowledge manifest', () => {
  it('matches sha256 for tracked files with canonical text hashing', () => {
    const dir = path.join(process.cwd(), 'src/server/knowledge');
    const manifestPath = path.join(dir, 'zarathoustra.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      files: Array<{ name: string; sha256: string }>;
    };

    for (const f of manifest.files) {
      const filePath = path.join(dir, f.name);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(sha256Canonical(filePath)).toBe(String(f.sha256));
    }
  });
});
