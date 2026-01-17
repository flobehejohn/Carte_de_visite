import { describe, it, expect } from 'vitest';
import type { ClimateTargets } from '../../params/ClimateController';
import { mapClimateToRenderParams } from './mapClimateToRenderParams';
import { RenderSafeRanges } from './materialParams';

const baseTargets: ClimateTargets = {
  presetName: 'Test',
  fog: { enabled: true, density: 0.02, color: '#112233' },
  bloom: { strength: 0.3, radius: 0.25, threshold: 0.8 },
  volume: {
    glowIntensity: 0.4,
    backgroundStrength: 0.5,
    softness: 0.6,
    vignette: 1.1,
    bgColor: '#010203',
    glowColor: 0x040506,
  },
  opacity: { wireOpacityMul: 1, particlesOpacityMul: 1, foregroundOpacity: 0.9 },
};

describe('mapClimateToRenderParams', () => {
  it('clamps outputs to render ranges', () => {
    const targets: ClimateTargets = {
      ...baseTargets,
      fog: { enabled: false, density: -1, color: '#ff00aa' },
      bloom: { strength: 9, radius: -2, threshold: 2 },
      volume: { ...baseTargets.volume, glowIntensity: -3, backgroundStrength: 9, softness: -1, vignette: 9 },
      opacity: { wireOpacityMul: -2, particlesOpacityMul: 9, foregroundOpacity: 9 },
    };

    const rp = mapClimateToRenderParams(targets);

    expect(rp.fog.density).toBeGreaterThanOrEqual(RenderSafeRanges.fogDensity.min);
    expect(rp.fog.density).toBeLessThanOrEqual(RenderSafeRanges.fogDensity.max);
    expect(rp.bloom.threshold).toBeGreaterThanOrEqual(RenderSafeRanges.bloomThreshold.min);
    expect(rp.bloom.threshold).toBeLessThanOrEqual(RenderSafeRanges.bloomThreshold.max);
    expect(rp.optics.alpha).toBeGreaterThanOrEqual(RenderSafeRanges.optics.alpha.min);
    expect(rp.optics.alpha).toBeLessThanOrEqual(RenderSafeRanges.optics.alpha.max);
    expect(rp.optics.ior).toBeGreaterThanOrEqual(RenderSafeRanges.optics.ior.min);
    expect(rp.optics.ior).toBeLessThanOrEqual(RenderSafeRanges.optics.ior.max);
    expect(rp.opacity.foregroundOpacity).toBeLessThanOrEqual(RenderSafeRanges.foregroundOpacity.max);
  });

  it('normalizes color inputs to numbers', () => {
    const targets: ClimateTargets = {
      ...baseTargets,
      fog: { enabled: true, density: 0.03, color: '#ff00aa' },
      volume: { ...baseTargets.volume, bgColor: '0x112233', glowColor: 0xff00aa },
    };

    const rp = mapClimateToRenderParams(targets);
    expect(rp.fog.color).toBe(0xff00aa);
    expect(rp.volume.bgColor).toBe(0x112233);
    expect(rp.volume.glowColor).toBe(0xff00aa);
  });

  it('uses a default when foregroundOpacity is missing', () => {
    const targets: ClimateTargets = {
      ...baseTargets,
      opacity: { wireOpacityMul: 1, particlesOpacityMul: 1 },
    };

    const rp = mapClimateToRenderParams(targets);
    expect(rp.opacity.foregroundOpacity).toBe(1);
  });

  it('applies smoothing without overshoot', () => {
    const prev = mapClimateToRenderParams(baseTargets);
    const nextTargets: ClimateTargets = {
      ...baseTargets,
      fog: { enabled: true, density: 0.08, color: '#224466' },
      bloom: { strength: 1.2, radius: 0.6, threshold: 0.6 },
      volume: { ...baseTargets.volume, glowIntensity: 1.2, backgroundStrength: 1.4, softness: 1.1 },
      opacity: { wireOpacityMul: 1.3, particlesOpacityMul: 1.4, foregroundOpacity: 1.1 },
    };

    const next = mapClimateToRenderParams(nextTargets);
    const smoothed = mapClimateToRenderParams(
      nextTargets,
      { dt: 100, smoothing: { enabled: true, tauMs: 500 } },
      prev
    );

    const minBloom = Math.min(prev.bloom.strength, next.bloom.strength);
    const maxBloom = Math.max(prev.bloom.strength, next.bloom.strength);
    expect(smoothed.bloom.strength).toBeGreaterThan(minBloom);
    expect(smoothed.bloom.strength).toBeLessThan(maxBloom);

    const minFog = Math.min(prev.fog.density, next.fog.density);
    const maxFog = Math.max(prev.fog.density, next.fog.density);
    expect(smoothed.fog.density).toBeGreaterThan(minFog);
    expect(smoothed.fog.density).toBeLessThan(maxFog);
  });
});
