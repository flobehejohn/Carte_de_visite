import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && (p.endsWith('.ts') || p.endsWith('.js')))
      out.push(p);
  }
  return out;
}

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

describe('applyMaterials integration (static)', () => {
  const repoRoot = process.cwd();
  const sceneRoot = path.join(repoRoot, 'src', 'scene');
  const applyFile = path.join(
    repoRoot,
    'src',
    'scene',
    'render',
    'materials',
    'applyMaterials.ts',
  );

  it('applyMaterials is called somewhere', () => {
    const files = walk(sceneRoot);
    const hits: string[] = [];

    for (const f of files) {
      if (path.normalize(f) === path.normalize(applyFile)) continue;
      const s = read(f);
      if (/\bapplyMaterials\s*\(/.test(s)) hits.push(f);
    }

    expect(hits.length).toBeGreaterThan(0);
  });

  it('single writer: no .material.<prop> writes outside applyMaterials.ts', () => {
    const files = walk(sceneRoot);
    const bad: Array<{ file: string; line: number; text: string }> = [];
    const re =
      /\.material\.(opacity|transparent|depthWrite|depthTest|renderOrder|dithering|alphaTest|alphaHash)\s*=/;

    for (const f of files) {
      if (path.normalize(f) === path.normalize(applyFile)) continue;
      const lines = read(f).split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (re.test(line))
          bad.push({ file: f, line: i + 1, text: line.trim() });
      }
    }

    if (bad.length > 0) {
      const msg = bad
        .slice(0, 20)
        .map((b) => `${b.file}:${b.line}: ${b.text}`)
        .join('\n');
      throw new Error(
        `Found material writes outside applyMaterials.ts:\n${msg}`,
      );
    }
  });
});
