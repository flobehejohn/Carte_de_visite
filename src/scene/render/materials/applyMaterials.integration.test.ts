// @vitest-environment node
type Dirent = { name: string; isDirectory(): boolean };
type FsModule = {
  readdirSync(path: string, opts: { withFileTypes: true }): Dirent[];
  readFileSync(path: string, encoding: 'utf8'): string;
};
type PathModule = {
  join(...parts: string[]): string;
  extname(path: string): string;
  normalize(path: string): string;
};
declare function require(name: 'fs'): FsModule;
declare function require(name: 'path'): PathModule;
declare const process: { cwd(): string };

const fs = require('fs');
const path = require('path');
import { describe, it, expect } from 'vitest';

const ROOT = path.join(process.cwd(), 'src', 'scene');
const APPLY_FILE = path.join(ROOT, 'render', 'materials', 'applyMaterials.ts');

function collectSourceFiles(dir: string, out: string[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === '.js' || ext === '.ts') {
      out.push(full);
    }
  }
}

function countToken(text: string, token: string): number {
  let idx = 0;
  let count = 0;
  while (true) {
    idx = text.indexOf(token, idx);
    if (idx === -1) break;
    count += 1;
    idx += token.length;
  }
  return count;
}

describe('applyMaterials integration', () => {
  it('is called and is the only writer for material flags', () => {
    const files: string[] = [];
    collectSourceFiles(ROOT, files);

    const applyToken = ['apply', 'Materials('].join('');
    const props = [
      'opacity',
      'transparent',
      'depthWrite',
      'depthTest',
      'renderOrder',
      'dithering',
      'alphaTest',
      'alphaHash',
    ];
    const assignPattern = new RegExp('\\.material\\.(' + props.join('|') + ')\\s*=');

    let applyCount = 0;
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (file !== APPLY_FILE) {
        applyCount += countToken(text, applyToken);
      }

      if (file === APPLY_FILE) continue;

      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (assignPattern.test(line)) {
          const normalized = path.normalize(file);
          violations.push({ file: normalized, line: i + 1, text: line.trim() });
        }
      }
    }

    if (applyCount < 1) {
      throw new Error('applyMaterials() is not called outside applyMaterials.ts');
    }

    if (violations.length > 0) {
      const sample = violations.slice(0, 20).map((v) => `${v.file}:${v.line} ${v.text}`);
      throw new Error(`material property writes found outside applyMaterials.ts:\n${sample.join('\n')}`);
    }

    expect(applyCount).toBeGreaterThan(0);
    expect(violations.length).toBe(0);
  });
});
