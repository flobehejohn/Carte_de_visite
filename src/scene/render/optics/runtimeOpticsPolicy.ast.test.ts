import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

describe('Pass 5.C runtime optics integration contracts', () => {
  it('routes climate bloom through runtime optics policy', () => {
    const climate = read('src/scene/params/ClimateController.ts');

    expect(climate).toContain('resolveRuntimeOpticsPolicy');
    expect(climate).toContain('bloomPolicy');
    expect(climate).toContain('iridescencePolicy');
    expect(climate).toContain('governedBloom');
  });

  it('exposes governed optics telemetry through orchestrator state bus', () => {
    const ritual = read('src/scene/RitualOrchestrator.js');

    expect(ritual).toContain('bloomPolicyState');
    expect(ritual).toContain('iridescencePolicyState');
    expect(ritual).toContain('bloomStrength');
    expect(ritual).toContain('bloomRadius');
    expect(ritual).toContain('bloomThreshold');
  });

  it('exposes governed optics on the audit snapshot', () => {
    const oracle = read('src/components/oracle/Oracle3DScene.tsx');

    expect(oracle).toContain('bloomPolicy');
    expect(oracle).toContain('iridescencePolicy');
    expect(oracle).toContain('telemetry');
  });

  it('does not introduce dynamic import in runtime files', () => {
    const files = [
      'src/scene/modules/orbLighting.js',
      'src/scene/modules/orbParticles.js',
      'src/scene/params/ClimateController.ts',
      'src/scene/RitualOrchestrator.js',
      'src/components/oracle/Oracle3DScene.tsx',
    ];

    for (const file of files) {
      expect(read(file)).not.toMatch(/\bimport\s*\(/);
    }
  });
});