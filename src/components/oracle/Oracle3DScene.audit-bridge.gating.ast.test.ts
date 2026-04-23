import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Oracle3DScene audit bridge gating', () => {
  it('locks explicit prod audit bridge gate and exported methods', () => {
    const file = path.resolve(process.cwd(), 'src/components/oracle/Oracle3DScene.tsx');
    const source = fs.readFileSync(file, 'utf8');

    expect(source).toContain("import.meta.env.VITE_ENABLE_ORB_AUDIT === 'true'");
    expect(source).toContain('(window as any).__ORB_AUDIT__ = {');
    expect(source).toContain('ready: () => !!orchestratorRef.current');
    expect(source).toContain('snapshot,');
    expect(source).toContain('setQualityProfile,');
    expect(source).toContain('setRenderMode,');
    expect(source).toContain('setVisibleSafeMode');
  });
});
