import { describe, it, expect } from 'vitest';
import { LightSafetyGovernor } from './LightSafetyGovernor';

describe('LightSafetyGovernor', () => {
  it('clamps after max over duration', () => {
    const bloomPass = { strength: 1.2, radius: 0.4, threshold: 0.8 };
    const renderer = { toneMappingExposure: 1.0 };
    const governor = new LightSafetyGovernor({ maxOverDurationMs: 2000, cooldownMs: 3000 });
    governor.attach({ renderer, bloomPass, scene: null });

    let result;
    for (let i = 0; i < 21; i += 1) {
      result = governor.update(100);
    }

    expect(result?.active).toBe(true);
    expect(result?.safetyFactor).toBeLessThan(1);
    expect(result?.cooldownMsLeft).toBeGreaterThan(0);
    expect(result?.bloomClamp?.strength).toBeLessThanOrEqual(1.0);
  });

  it('resets over timer when signal falls under low threshold', () => {
    const bloomPass = { strength: 1.2, radius: 0.4, threshold: 0.8 };
    const governor = new LightSafetyGovernor({ maxOverDurationMs: 2000, cooldownMs: 3000 });
    governor.attach({ bloomPass });

    let result;
    for (let i = 0; i < 10; i += 1) {
      result = governor.update(100);
    }

    expect(result?.active).toBe(false);
    expect(result?.overMs).toBeGreaterThan(0);

    bloomPass.strength = 0.8;
    result = governor.update(100);

    expect(result?.overMs).toBe(0);
    expect(result?.active).toBe(false);
  });

  it('keeps factor capped during cooldown even if signal drops', () => {
    const bloomPass = { strength: 1.2, radius: 0.4, threshold: 0.8 };
    const governor = new LightSafetyGovernor({ maxOverDurationMs: 1000, cooldownMs: 500 });
    governor.attach({ bloomPass });

    let result;
    for (let i = 0; i < 11; i += 1) {
      result = governor.update(100);
    }

    expect(result?.active).toBe(true);

    bloomPass.strength = 0.7;
    result = governor.update(100);

    expect(result?.active).toBe(true);
    expect(result?.safetyFactor).toBeLessThan(1);
    expect(result?.safetyFactor).toBeLessThanOrEqual(0.9);

    result = governor.update(500);
    expect(result?.cooldownMsLeft).toBe(0);

    result = governor.update(100);
    expect(result?.active).toBe(false);
  });
});
