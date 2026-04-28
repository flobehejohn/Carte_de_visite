import { describe, expect, it } from 'vitest';
import {
  mapQualityProfileToIridescenceState,
  normalizeIridescenceQualityProfile,
  resolveIridescencePolicy,
  type IridescencePolicy,
} from './iridescencePolicy';

function expectFiniteNonNegativePolicy(policy: IridescencePolicy): void {
  expect(Number.isFinite(policy.intensity)).toBe(true);
  expect(Number.isFinite(policy.hueShift)).toBe(true);
  expect(Number.isFinite(policy.edgeBias)).toBe(true);
  expect(Number.isFinite(policy.temporalDrift)).toBe(true);

  expect(policy.intensity).toBeGreaterThanOrEqual(0);
  expect(policy.hueShift).toBeGreaterThanOrEqual(0);
  expect(policy.edgeBias).toBeGreaterThanOrEqual(0);
  expect(policy.temporalDrift).toBeGreaterThanOrEqual(0);
}

describe('iridescencePolicy', () => {
  it('normalizes unknown profiles to medium', () => {
    expect(normalizeIridescenceQualityProfile('unknown')).toBe('medium');
    expect(normalizeIridescenceQualityProfile(null)).toBe('medium');
    expect(normalizeIridescenceQualityProfile(undefined)).toBe('medium');
  });

  it('maps ultra to expressive', () => {
    expect(mapQualityProfileToIridescenceState('ultra')).toEqual({
      state: 'expressive',
      source: 'quality-profile',
    });
  });

  it('maps high to subtle by default and expressive under high ritual state', () => {
    expect(mapQualityProfileToIridescenceState('high', 0.2)).toEqual({
      state: 'subtle',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToIridescenceState('high', 0.9)).toEqual({
      state: 'expressive',
      source: 'ritual-state',
    });
  });

  it('maps medium, low and safe to bounded states', () => {
    expect(mapQualityProfileToIridescenceState('medium')).toEqual({
      state: 'subtle',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToIridescenceState('low')).toEqual({
      state: 'minimal',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToIridescenceState('safe')).toEqual({
      state: 'off',
      source: 'quality-profile',
    });
  });

  it('keeps ultra inside expressive caps', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'ultra',
      requested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy.state).toBe('expressive');
    expect(policy.intensity).toBeLessThanOrEqual(0.85);
    expect(policy.hueShift).toBeLessThanOrEqual(0.24);
    expect(policy.edgeBias).toBeLessThanOrEqual(0.85);
    expect(policy.temporalDrift).toBeLessThanOrEqual(0.12);
    expect(policy.source).toBe('safety-cap');
    expect(policy.safetyClamped).toBe(true);
  });

  it('keeps medium inside subtle caps', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'medium',
      requested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy.state).toBe('subtle');
    expect(policy.intensity).toBeLessThanOrEqual(0.4);
    expect(policy.hueShift).toBeLessThanOrEqual(0.12);
    expect(policy.edgeBias).toBeLessThanOrEqual(0.5);
    expect(policy.temporalDrift).toBeLessThanOrEqual(0.06);
    expect(policy.safetyClamped).toBe(true);
  });

  it('keeps low inside minimal caps', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'low',
      requested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy.state).toBe('minimal');
    expect(policy.intensity).toBeLessThanOrEqual(0.18);
    expect(policy.hueShift).toBeLessThanOrEqual(0.06);
    expect(policy.edgeBias).toBeLessThanOrEqual(0.3);
    expect(policy.temporalDrift).toBeLessThanOrEqual(0.03);
    expect(policy.safetyClamped).toBe(true);
  });

  it('safe defaults to a quality-profile off policy', () => {
    expect(resolveIridescencePolicy({
      qualityProfile: 'safe',
    })).toEqual({
      state: 'off',
      intensity: 0,
      hueShift: 0,
      edgeBias: 0,
      temporalDrift: 0,
      source: 'quality-profile',
      safetyClamped: false,
    });
  });

  it('safe cuts aggressive iridescence', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'safe',
      requested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    });

    expect(policy).toEqual({
      state: 'off',
      intensity: 0,
      hueShift: 0,
      edgeBias: 0,
      temporalDrift: 0,
      source: 'safety-cap',
      safetyClamped: true,
    });
  });

  it('forceOff always returns a safety-capped off policy', () => {
    expect(resolveIridescencePolicy({
      qualityProfile: 'ultra',
      ritualState: 1,
      forceOff: true,
      requested: {
        intensity: 99,
        hueShift: 99,
        edgeBias: 99,
        temporalDrift: 99,
      },
    })).toEqual({
      state: 'off',
      intensity: 0,
      hueShift: 0,
      edgeBias: 0,
      temporalDrift: 0,
      source: 'safety-cap',
      safetyClamped: true,
    });
  });

  it('applies safetyFactor as an additional cap', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'ultra',
      safetyFactor: 0.5,
    });

    expect(policy.intensity).toBeLessThanOrEqual(0.85 * 0.5);
    expect(policy.hueShift).toBeLessThanOrEqual(0.24 * 0.5);
    expect(policy.edgeBias).toBeLessThanOrEqual(0.85 * 0.5);
    expect(policy.temporalDrift).toBeLessThanOrEqual(0.12 * 0.5);
    expect(policy.source).toBe('safety-cap');
    expect(policy.safetyClamped).toBe(true);
  });

  it('does not emit NaN, Infinity or negative values', () => {
    const policy = resolveIridescencePolicy({
      qualityProfile: 'ultra',
      ritualState: Number.NaN,
      safetyFactor: Number.POSITIVE_INFINITY,
      requested: {
        intensity: Number.NaN,
        hueShift: -10,
        edgeBias: Number.NEGATIVE_INFINITY,
        temporalDrift: Number.POSITIVE_INFINITY,
      },
    });

    expectFiniteNonNegativePolicy(policy);
    expect(policy.intensity).toBeLessThanOrEqual(0.85);
    expect(policy.hueShift).toBeLessThanOrEqual(0.24);
    expect(policy.edgeBias).toBeLessThanOrEqual(0.85);
    expect(policy.temporalDrift).toBeLessThanOrEqual(0.12);
    expect(policy.safetyClamped).toBe(true);
  });

  it('is pure and does not mutate input', () => {
    const input = {
      qualityProfile: 'medium',
      ritualState: 0.5,
      safetyFactor: 1,
      requested: {
        intensity: 0.3,
        hueShift: 0.1,
        edgeBias: 0.4,
        temporalDrift: 0.03,
      },
    } as const;

    const before = JSON.stringify(input);
    const first = resolveIridescencePolicy(input);
    const second = resolveIridescencePolicy(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(first).toEqual(second);
  });
});