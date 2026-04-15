/* @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = new URL('./RitualOrchestrator.js', import.meta.url);
const source = readFileSync(SOURCE_PATH, 'utf8');

describe('RitualOrchestrator observability migration', () => {
  it('supprime les console directs', () => {
    expect(source).not.toMatch(/console\.(log|info|warn|error|debug)\s*\(/);
  });

  it('importe les helpers orbDebug', () => {
    expect(source).toMatch(
      /import\s+\{\s*orbLog\s*,\s*orbWarn\s*\}\s+from\s+['"]\.\.\/shared\/debug\/orbDebug['"]/,
    );
  });

  it('route le bypass du bridge audit vers orbWarn', () => {
    expect(source).toContain('OrbAuditBridge init bypassed in live runtime.');
    expect(source).toContain('ritual:orb-audit-bridge-init-bypass');
    expect(source).toMatch(/orbWarn\s*\(\s*'RitualOrchestrator'/);
  });

  it('journalise la seed via orbLog', () => {
    expect(source).toContain('seed prepared: ${seedString}');
    expect(source).toContain('ritual:init-seed');
    expect(source).toMatch(/orbLog\s*\(\s*'RitualOrchestrator'/);
  });

  it('route spawnOracle bypassed vers orbWarn', () => {
    expect(source).toContain('spawnOracle bypassed');
    expect(source).toContain('ritual:spawn-oracle-bypassed');
  });

  it('rend la mise à jour des métriques texte observable et silencieuse par défaut', () => {
    expect(source).toContain('text metrics updated');
    expect(source).toContain('ritual:text-metrics-updated');
    expect(source).toContain('payload.textMetrics');
  });
});
