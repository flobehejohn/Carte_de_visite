/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = new URL('./LightSafetyGovernor.ts', import.meta.url);
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('LightSafetyGovernor observability migration', () => {
  it('supprime les console directs', () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });

  it('importe orbDebug depuis le bon chemin', () => {
    expect(source).toMatch(
      /import\s+\{\s*orbLog\s*,\s*orbWarn\s*\}\s+from\s+['"]\.\.\/\.\.\/shared\/debug\/orbDebug['"]/,
    );
  });

  it('route les warnings vers orbWarn', () => {
    expect(source).toContain("orbWarn('LightSafety', message, options)");
  });

  it('route les debug/info vers orbLog', () => {
    expect(source).toContain("orbLog('LightSafety', message, options)");
  });

  it('conserve un throttle centralisé', () => {
    expect(source).toContain('throttleMs: 1000');
    expect(source).toContain('light-safety:${level}:${message}');
  });
});
