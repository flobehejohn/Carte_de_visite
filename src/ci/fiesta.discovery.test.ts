import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function collectTests(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (
      ['node_modules', 'dist', 'build', 'coverage', 'audit', '.git'].includes(
        e.name,
      )
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectTests(p, out);
    else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const CRITICAL_TESTS = [
  'src/server/knowledge/retriever.test.ts',
  'src/server/knowledge/knowledgeIntegrity.test.ts',
  'src/server/contracts/oracle.wire.test.ts',
];

describe('ci fiesta test discovery (anti-régression)', () => {
  it('le dossier src existe', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src'))).toBe(true);
  });

  it('il existe des fichiers de test sous src', () => {
    const root = path.resolve(process.cwd(), 'src');
    const list = collectTests(root);
    expect(list.length).toBeGreaterThan(0);
  });

  it('les tests critiques attendus existent (chemins stables)', () => {
    for (const rel of CRITICAL_TESTS) {
      const abs = path.resolve(process.cwd(), rel);
      expect(fs.existsSync(abs), `Test critique manquant: ${rel}`).toBe(true);
    }
  });
});
