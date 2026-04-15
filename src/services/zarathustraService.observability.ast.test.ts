/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = new URL('./zarathustraService.ts', import.meta.url);
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('zarathustraService observability migration', () => {
  it('supprime les console directs', () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });

  it('importe orbDebug depuis le bon chemin', () => {
    expect(source).toMatch(
      /import\s+\{\s*orbLog\s*,\s*orbWarn\s*\}\s+from\s+['"]\.\.\/shared\/debug\/orbDebug['"]/,
    );
  });

  it('conserve la factory createThrottledLogger', () => {
    expect(source).toContain('function createThrottledLogger(');
    expect(source).toContain('const logger = createThrottledLogger(');
  });

  it('route logger.log vers orbLog', () => {
    expect(source).toContain('orbLog(');
    expect(source).toContain('key: `${prefix}:info:${message}`');
  });

  it('route logger.warn vers orbWarn', () => {
    expect(source).toContain('orbWarn(');
    expect(source).toContain('key: `${prefix}:warn:${message}`');
  });

  it('conserve le throttle configuré par LOG_THROTTLE_MS', () => {
    expect(source).toContain('const LOG_THROTTLE_MS = 1200;');
    expect(source).toContain('throttleMs,');
  });
});
