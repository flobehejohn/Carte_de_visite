/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = new URL('./geminiClient.ts', import.meta.url);
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('geminiClient observability migration', () => {
  it('supprime les console directs', () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });

  it('importe orbError depuis le bon chemin', () => {
    expect(source).toMatch(
      /import\s+\{\s*orbError\s*\}\s+from\s+['"]\.\.\/shared\/debug\/orbDebug['"]/,
    );
  });

  it('route logGeminiClientError vers orbError', () => {
    expect(source).toContain('orbError(');
    expect(source).toContain("'geminiClient'");
    expect(source).toContain('[kind=${args.kind}]');
  });

  it('conserve le garde-fou isDevRuntime', () => {
    expect(source).toContain('if (!isDevRuntime()) return;');
  });

  it('conserve une clé de throttle dédiée', () => {
    expect(source).toContain(
      "gemini-client:error:${args.kind}:${args.traceId}:${args.status ?? 'na'}",
    );
    expect(source).toContain('throttleMs: 1200');
  });

  it('utilise l’URL résolue dans fetch', () => {
    expect(source).toContain('r = await fetch(url, {');
  });
});
