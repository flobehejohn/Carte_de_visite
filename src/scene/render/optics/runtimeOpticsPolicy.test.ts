import { describe, expect, it } from 'vitest';
import { resolveRuntimeOpticsPolicy } from './runtimeOpticsPolicy';

describe('runtimeOpticsPolicy', () => {
  it('resolves governed bloom and iridescence together', () => {
    const policy = resolveRuntimeOpticsPolicy({
      qualityProfile: 'ultra',
      ritualEnergy: 0.9,
      ritualState: 0.9,
      bloomRequested: {
        strength: 99,
        radius: 99,
        threshold: 0,
      },
      iridescenceRequested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy.bloomPolicy.state).toBe('cinematic');
    expect(policy.iridescencePolicy.state).toBe('expressive');

    expect(policy.bloomPolicy.strength).toBeLessThanOrEqual(1.35);
    expect(policy.bloomPolicy.radius).toBeLessThanOrEqual(0.65);
    expect(policy.bloomPolicy.threshold).toBeGreaterThanOrEqual(0.25);

    expect(policy.iridescencePolicy.intensity).toBeLessThanOrEqual(0.85);
    expect(policy.iridescencePolicy.hueShift).toBeLessThanOrEqual(0.24);
    expect(policy.iridescencePolicy.edgeBias).toBeLessThanOrEqual(0.85);
    expect(policy.iridescencePolicy.temporalDrift).toBeLessThanOrEqual(0.12);

    expect(policy.telemetry).toEqual({
      bloomPolicyState: policy.bloomPolicy.state,
      iridescencePolicyState: policy.iridescencePolicy.state,
      bloomStrength: policy.bloomPolicy.strength,
      bloomRadius: policy.bloomPolicy.radius,
      bloomThreshold: policy.bloomPolicy.threshold,
    });
  });

  it('hard-disables bloom and iridescence in safe mode', () => {
    const policy = resolveRuntimeOpticsPolicy({
      qualityProfile: 'safe',
      ritualEnergy: 1,
      ritualState: 1,
      bloomRequested: {
        strength: 99,
        radius: 99,
        threshold: 0,
      },
      iridescenceRequested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy.bloomPolicy).toMatchObject({
      state: 'off',
      strength: 0,
      radius: 0,
      threshold: 1,
      source: 'safety-cap',
      safetyClamped: true,
    });

    expect(policy.iridescencePolicy).toMatchObject({
      state: 'off',
      intensity: 0,
      hueShift: 0,
      edgeBias: 0,
      temporalDrift: 0,
      source: 'safety-cap',
      safetyClamped: true,
    });

    expect(policy.telemetry.bloomPolicyState).toBe('off');
    expect(policy.telemetry.iridescencePolicyState).toBe('off');
  });

  it('does not emit negative, NaN or Infinity telemetry', () => {
    const policy = resolveRuntimeOpticsPolicy({
      qualityProfile: 'ultra',
      ritualEnergy: Number.NaN,
      ritualState: Number.POSITIVE_INFINITY,
      safetyFactor: Number.NEGATIVE_INFINITY,
      bloomRequested: {
        strength: Number.NaN,
        radius: Number.POSITIVE_INFINITY,
        threshold: Number.NEGATIVE_INFINITY,
      },
      iridescenceRequested: {
        intensity: Number.NaN,
        hueShift: Number.NEGATIVE_INFINITY,
        edgeBias: Number.POSITIVE_INFINITY,
        temporalDrift: -100,
      },
    });

    for (const value of Object.values(policy.telemetry)) {
      if (typeof value === 'number') {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});