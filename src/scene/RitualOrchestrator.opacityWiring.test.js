import { describe, expect, it } from 'vitest';
import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('RitualOrchestrator — opacity wiring', () => {
  it('applique targets.opacity vers les multiplicateurs et le ctx d’audit', () => {
    const ctx = {};
    const orch = new RitualOrchestrator(ctx);

    orch.applyTargetsToRuntime(
      ctx,
      {
        opacity: {
          wireOpacityMul: 0.5,
          particlesOpacityMul: 0.25,
          foregroundOpacity: 0.1,
        },
      },
      1.0,
    );

    expect(orch._climateWireOpacityMul).toBeCloseTo(0.5);
    expect(orch._climateParticlesOpacityMul).toBeCloseTo(0.25);
    expect(orch._climateForegroundOpacity).toBeCloseTo(0.1);

    expect(ctx.appliedOpacityWireMul).toBeCloseTo(0.5);
    expect(ctx.appliedOpacityParticlesMul).toBeCloseTo(0.25);
    expect(ctx.appliedOpacityForeground).toBeCloseTo(0.1);
    expect(ctx.appliedSafetyFactor).toBe(1);
  });
});
