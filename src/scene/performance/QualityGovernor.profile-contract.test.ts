import { describe, expect, it } from 'vitest';
import {
  QUALITY_PROFILE_NAMES,
  QUALITY_PROFILES,
  type QualityProfileName,
} from './QualityGovernor';

describe('QualityGovernor profile contract', () => {
  it('expose exactement les profils attendus', () => {
    expect(QUALITY_PROFILE_NAMES).toEqual(['safe', 'low', 'medium', 'high', 'ultra']);
    expect(Object.keys(QUALITY_PROFILES)).toEqual(['safe', 'low', 'medium', 'high', 'ultra']);
  });

  it('chaque profil expose tous les champs de gouvernance attendus', () => {
    for (const name of QUALITY_PROFILE_NAMES) {
      const profile = QUALITY_PROFILES[name];

      expect(profile.name).toBe(name);
      expect(typeof profile.maxDpr).toBe('number');
      expect(typeof profile.bloomEnabled).toBe('boolean');
      expect(typeof profile.bloomStrengthMax).toBe('number');
      expect(typeof profile.fogDensityCeiling).toBe('number');
      expect(typeof profile.smokeAlphaLayer).toBe('number');
      expect(typeof profile.fluidParticleCount).toBe('number');
      expect(typeof profile.fluidUpdateRate).toBe('number');
      expect(typeof profile.shadowMapEnabled).toBe('boolean');
      expect(typeof profile.shadowMapResolution).toBe('number');
      expect(typeof profile.volumetricBackgroundStrength).toBe('number');
      expect(typeof profile.glowIntensityMax).toBe('number');
      expect(typeof profile.text3DEnabled).toBe('boolean');

      expect(typeof profile.partialUpdateDivisors.fluid).toBe('number');
      expect(typeof profile.partialUpdateDivisors.lighting).toBe('number');
      expect(typeof profile.partialUpdateDivisors.volumes).toBe('number');
      expect(typeof profile.partialUpdateDivisors.text).toBe('number');
    }
  });

  it('respecte une progression monotone des coûts principaux', () => {
    const ordered: QualityProfileName[] = ['safe', 'low', 'medium', 'high', 'ultra'];

    for (let i = 1; i < ordered.length; i += 1) {
      const prev = QUALITY_PROFILES[ordered[i - 1]];
      const next = QUALITY_PROFILES[ordered[i]];

      expect(prev.maxDpr).toBeLessThanOrEqual(next.maxDpr);
      expect(prev.fogDensityCeiling).toBeLessThanOrEqual(next.fogDensityCeiling);
      expect(prev.smokeAlphaLayer).toBeLessThanOrEqual(next.smokeAlphaLayer);
      expect(prev.fluidParticleCount).toBeLessThanOrEqual(next.fluidParticleCount);
      expect(prev.shadowMapResolution).toBeLessThanOrEqual(next.shadowMapResolution);
      expect(prev.volumetricBackgroundStrength).toBeLessThanOrEqual(next.volumetricBackgroundStrength);
      expect(prev.glowIntensityMax).toBeLessThanOrEqual(next.glowIntensityMax);

      expect(prev.partialUpdateDivisors.fluid).toBeGreaterThanOrEqual(next.partialUpdateDivisors.fluid);
      expect(prev.partialUpdateDivisors.lighting).toBeGreaterThanOrEqual(next.partialUpdateDivisors.lighting);
      expect(prev.partialUpdateDivisors.volumes).toBeGreaterThanOrEqual(next.partialUpdateDivisors.volumes);
      expect(prev.partialUpdateDivisors.text).toBeGreaterThanOrEqual(next.partialUpdateDivisors.text);
    }
  });

  it('verrouille les garde-fous des profils low/safe', () => {
    expect(QUALITY_PROFILES.safe.bloomEnabled).toBe(false);
    expect(QUALITY_PROFILES.safe.shadowMapEnabled).toBe(false);
    expect(QUALITY_PROFILES.safe.text3DEnabled).toBe(false);
    expect(QUALITY_PROFILES.safe.fluidParticleCount).toBe(0);

    expect(QUALITY_PROFILES.low.bloomEnabled).toBe(false);
    expect(QUALITY_PROFILES.low.shadowMapEnabled).toBe(false);
    expect(QUALITY_PROFILES.low.text3DEnabled).toBe(false);
  });

  it('garde des profils riches sur medium/high/ultra', () => {
    expect(QUALITY_PROFILES.medium.bloomEnabled).toBe(true);
    expect(QUALITY_PROFILES.medium.text3DEnabled).toBe(true);
    expect(QUALITY_PROFILES.high.shadowMapEnabled).toBe(true);
    expect(QUALITY_PROFILES.ultra.shadowMapResolution).toBeGreaterThan(
      QUALITY_PROFILES.high.shadowMapResolution,
    );
  });
});
