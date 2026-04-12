import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function sha256(p: string) {
  const buf = fs.readFileSync(p);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

describe('Zarathoustra knowledge manifest', () => {
  it('matches sha256 for tracked files', () => {
    const dir = path.join(process.cwd(), 'src/server/knowledge');
    const manifestPath = path.join(dir, 'zarathoustra.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const f of manifest.files) {
      const p = path.join(dir, f.name);
      expect(fs.existsSync(p)).toBe(true);
      expect(sha256(p)).toBe(String(f.sha256));
    }
  });
});
