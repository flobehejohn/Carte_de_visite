import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrbAuditBridge function preservation', () => {
  it('preserves runtime bridge functions when telemetry merges update the root', () => {
    const file = path.resolve(process.cwd(), 'src/scene/audit/OrbAuditBridge.ts');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).toContain('function preserveAuditBridgeFunctions(');
    expect(source).toContain('setQualityProfile');
    expect(source).toContain('setRenderMode');
    expect(source).toContain('setVisibleSafeMode');
    expect(source).toContain('snapshot');
    expect(source).toContain('ready');
    expect(source).toContain('preserveAuditBridgeFunctions(window.__ORB_AUDIT__, {');
  });
});
