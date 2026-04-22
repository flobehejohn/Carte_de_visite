import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Oracle3DScene particle governance snapshot wiring', () => {
  it('expose le bridge audit renforcé et les clés de télémétrie particulaire', () => {
    const filePath = path.resolve(__dirname, './Oracle3DScene.tsx');
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toContain(`import.meta.env.VITE_ENABLE_ORB_AUDIT === 'true'`);
    expect(source).toContain('autoDetected:');
    expect(source).toContain('meshCapacity:');
    expect(source).toContain('targetMaxCount:');
    expect(source).toContain('appliedMaxCount:');
    expect(source).toContain('lastProfileApplied:');
    expect(source).toContain('setQualityProfile,');
  });
});
