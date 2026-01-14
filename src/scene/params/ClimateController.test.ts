import { describe, it, expect } from 'vitest';
import { ClimateController } from './ClimateController';

describe('ClimateController', () => {
  it('keeps targets inside safe ranges', () => {
    const controller = new ClimateController({ seed: 'safe-test' });
    controller.setProgress(0.5);
    controller.update(2000);
    const t = controller.getTargets();

    expect(t.fog.density).toBeGreaterThanOrEqual(0.005);
    expect(t.fog.density).toBeLessThanOrEqual(0.06);
    expect(t.bloom.strength).toBeGreaterThanOrEqual(0.0);
    expect(t.bloom.strength).toBeLessThanOrEqual(1.35);
    expect(t.bloom.radius).toBeGreaterThanOrEqual(0.0);
    expect(t.bloom.radius).toBeLessThanOrEqual(0.55);
    expect(t.bloom.threshold).toBeGreaterThanOrEqual(0.65);
    expect(t.bloom.threshold).toBeLessThanOrEqual(0.95);
    expect(t.volume.glowIntensity).toBeGreaterThanOrEqual(0.1);
    expect(t.volume.glowIntensity).toBeLessThanOrEqual(0.9);
    expect(t.volume.backgroundStrength).toBeGreaterThanOrEqual(0.1);
    expect(t.volume.backgroundStrength).toBeLessThanOrEqual(1.1);
    expect(t.volume.softness).toBeGreaterThanOrEqual(0.1);
    expect(t.volume.softness).toBeLessThanOrEqual(1.25);
    expect(t.volume.vignette).toBeGreaterThanOrEqual(0.1);
    expect(t.volume.vignette).toBeLessThanOrEqual(3.0);
    expect(t.opacity.wireOpacityMul).toBeGreaterThanOrEqual(0.4);
    expect(t.opacity.wireOpacityMul).toBeLessThanOrEqual(1.25);
    expect(t.opacity.particlesOpacityMul).toBeGreaterThanOrEqual(0.4);
    expect(t.opacity.particlesOpacityMul).toBeLessThanOrEqual(1.25);
  });

  it('maps fog_density to FogExp2 density range', () => {
    const c0 = new ClimateController({ seed: 'fog-0' });
    c0.setVisualParams({ fog_density: 0 });
    c0.setProgress(0.4);
    c0.update(1);
    expect(c0.getTargets().fog.density).toBeCloseTo(0.008, 3);

    const c1 = new ClimateController({ seed: 'fog-1' });
    c1.setVisualParams({ fog_density: 1 });
    c1.setProgress(0.4);
    c1.update(1);
    expect(c1.getTargets().fog.density).toBeCloseTo(0.045, 3);
  });

  it('raises bloom and glow during rise then eases down at the end', () => {
    const controller = new ClimateController({ seed: 'curve-test' });
    controller.setProgress(0.1);
    controller.update(1000);
    const early = controller.getTargets();

    controller.setProgress(0.6);
    controller.update(3000);
    const mid = controller.getTargets();

    controller.setProgress(0.95);
    controller.update(3000);
    const late = controller.getTargets();

    expect(mid.bloom.strength).toBeGreaterThan(early.bloom.strength);
    expect(mid.volume.glowIntensity).toBeGreaterThan(early.volume.glowIntensity);
    expect(late.bloom.strength).toBeLessThan(mid.bloom.strength);
    expect(late.volume.glowIntensity).toBeLessThan(mid.volume.glowIntensity);
  });
});
