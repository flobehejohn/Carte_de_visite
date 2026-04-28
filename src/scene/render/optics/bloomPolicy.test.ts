import { describe, expect, it } from 'vitest';
import {
  mapQualityProfileToBloomState,
  normalizeBloomQualityProfile,
  resolveBloomPolicy,
  type BloomPolicy,
} from './bloomPolicy';

function expectFiniteNonNegativePolicy(policy: BloomPolicy): void {
  expect(Number.isFinite(policy.threshold)).toBe(true);
  expect(Number.isFinite(policy.strength)).toBe(true);
  expect(Number.isFinite(policy.radius)).toBe(true);

  expect(policy.threshold).toBeGreaterThanOrEqual(0);
  expect(policy.strength).toBeGreaterThanOrEqual(0);
  expect(policy.radius).toBeGreaterThanOrEqual(0);
}

describe('bloomPolicy', () => {
  it('normalizes unknown profiles to medium', () => {
    expect(normalizeBloomQualityProfile('unknown')).toBe('medium');
    expect(normalizeBloomQualityProfile(null)).toBe('medium');
    expect(normalizeBloomQualityProfile(undefined)).toBe('medium');
  });

  it('maps ultra to cinematic', () => {
    expect(mapQualityProfileToBloomState('ultra')).toEqual({
      state: 'cinematic',
      source: 'quality-profile',
    });
  });

  it('maps high to balanced by default and cinematic under high ritual energy', () => {
    expect(mapQualityProfileToBloomState('high', 0.2)).toEqual({
      state: 'balanced',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToBloomState('high', 0.9)).toEqual({
      state: 'cinematic',
      source: 'ritual-energy',
    });
  });

  it('maps medium, low and safe to bounded states', () => {
    expect(mapQualityProfileToBloomState('medium')).toEqual({
      state: 'balanced',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToBloomState('low')).toEqual({
      state: 'conservative',
      source: 'quality-profile',
    });

    expect(mapQualityProfileToBloomState('safe')).toEqual({
      state: 'off',
      source: 'quality-profile',
    });
  });

  it('keeps ultra inside the requested caps', () => {
    const policy = resolveBloomPolicy({
      qualityProfile: 'ultra',
      requested: {
        threshold: 0,
        strength: 99,
        radius: 99,
      },
    });

    expect(policy.state).toBe('cinematic');
    expect(policy.strength).toBeLessThanOrEqual(1.35);
    expect(policy.radius).toBeLessThanOrEqual(0.65);
    expect(policy.threshold).toBeGreaterThanOrEqual(0.25);
    expect(policy.safetyClamped).toBe(true);
    expect(policy.source).toBe('safety-cap');
  });

  it('keeps medium inside the requested caps', () => {
    const policy = resolveBloomPolicy({
      qualityProfile: 'medium',
      requested: {
        threshold: 0,
        strength: 99,
        radius: 99,
      },
    });

    expect(policy.state).toBe('balanced');
    expect(policy.strength).toBeLessThanOrEqual(0.75);
    expect(policy.radius).toBeLessThanOrEqual(0.35);
    expect(policy.threshold).toBeGreaterThanOrEqual(0.55);
    expect(policy.safetyClamped).toBe(true);
  });

  it('safe defaults to a quality-profile off policy', () => {
    expect(resolveBloomPolicy({
      qualityProfile: 'safe',
    })).toEqual({
      state: 'off',
      threshold: 1,
      strength: 0,
      radius: 0,
      source: 'quality-profile',
      safetyClamped: false,
    });
  });

  it('safe cuts aggressive bloom', () => {
    const policy = resolveBloomPolicy({
      qualityProfile: 'safe',
      requested: {
        threshold: 0,
        strength: 99,
        radius: 99,
      },
    });

    expect(policy.state).toBe('off');
    expect(policy.strength).toBe(0);
    expect(policy.radius).toBe(0);
    expect(policy.threshold).toBe(1);
    expect(policy.strength).toBeLessThanOrEqual(0.15);
    expect(policy.radius).toBeLessThanOrEqual(0.1);
    expect(policy.threshold).toBeGreaterThanOrEqual(0.85);
    expect(policy.safetyClamped).toBe(true);
    expect(policy.source).toBe('safety-cap');
  });

  it('forceOff always returns a safety-capped off policy', () => {
    expect(resolveBloomPolicy({
      qualityProfile: 'ultra',
      ritualEnergy: 1,
      forceOff: true,
      requested: {
        threshold: 0,
        strength: 99,
        radius: 99,
      },
    })).toEqual({
      state: 'off',
      threshold: 1,
      strength: 0,
      radius: 0,
      source: 'safety-cap',
      safetyClamped: true,
    });
  });

  it('applies safetyFactor as an additional cap', () => {
    const policy = resolveBloomPolicy({
      qualityProfile: 'ultra',
      safetyFactor: 0.5,
    });

    expect(policy.strength).toBeLessThanOrEqual(1.35 * 0.5);
    expect(policy.radius).toBeLessThanOrEqual(0.65 * 0.5);
    expect(policy.threshold).toBeGreaterThanOrEqual(0.625);
    expect(policy.source).toBe('safety-cap');
    expect(policy.safetyClamped).toBe(true);
  });

  it('does not emit NaN, Infinity or negative values', () => {
    const policy = resolveBloomPolicy({
      qualityProfile: 'ultra',
      ritualEnergy: Number.NaN,
      safetyFactor: Number.POSITIVE_INFINITY,
      requested: {
        threshold: Number.NaN,
        strength: -10,
        radius: Number.NEGATIVE_INFINITY,
      },
    });

    expectFiniteNonNegativePolicy(policy);
    expect(policy.threshold).toBeLessThanOrEqual(1);
    expect(policy.strength).toBeGreaterThanOrEqual(0);
    expect(policy.radius).toBeGreaterThanOrEqual(0);
  });

  it('is pure and does not mutate input', () => {
    const input = {
      qualityProfile: 'medium',
      ritualEnergy: 0.5,
      safetyFactor: 1,
      requested: {
        threshold: 0.4,
        strength: 0.7,
        radius: 0.3,
      },
    } as const;

    const before = JSON.stringify(input);
    const first = resolveBloomPolicy(input);
    const second = resolveBloomPolicy(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(first).toEqual(second);
  });
});