import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('OrbAuditBridge legacy path', () => {
  it('is only a shim to the canonical audit path', () => {
    const file = path.resolve(process.cwd(), 'src/scene/OrbAuditBridge.ts');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).toContain("export * from './audit/OrbAuditBridge.ts';");
    expect(source).not.toContain('window.__ORB_AUDIT__ =');
  });
});
