import { describe, expect, it, vi } from 'vitest';

vi.mock('gsap', () => ({ default: { to: vi.fn(), set: vi.fn() } }));
vi.mock('./modules/orbTextManager.js', () => ({
  OrbTextManager: vi.fn().mockImplementation(() => ({
    loadFont: vi.fn(),
    spawnOracle: vi.fn(),
    animateReveal: vi.fn(),
    clear: vi.fn(),
    revealProgress: { value: 0 },
  })),
}));

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
  });
});
