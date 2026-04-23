import { describe, expect, it } from 'vitest';
import {
  QUALITY_PROFILES,
  QUALITY_PROFILE_NAMES,
  type QualityProfileName,
} from '../../performance/QualityGovernor';

const ORDER: QualityProfileName[] = [...QUALITY_PROFILE_NAMES];

describe('smoke policy profile contract', () => {
  it('exposes a finite smokeAlphaLayer for every quality profile', () => {
    for (const name of ORDER) {
      const profile = QUALITY_PROFILES[name];
      expect(profile).toBeDefined();
      expect(typeof profile.smokeAlphaLayer).toBe('number');
      expect(Number.isFinite(profile.smokeAlphaLayer)).toBe(true);
      expect(profile.smokeAlphaLayer).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps smokeAlphaLayer monotonic from safe to ultra', () => {
    for (let i = 1; i < ORDER.length; i += 1) {
      const prev = QUALITY_PROFILES[ORDER[i - 1]];
      const next = QUALITY_PROFILES[ORDER[i]];
      expect(prev.smokeAlphaLayer).toBeLessThanOrEqual(next.smokeAlphaLayer);
    }
  });

  it('keeps fallback compensation knobs defined for every profile', () => {
    for (const name of ORDER) {
      const profile = QUALITY_PROFILES[name];

      expect(typeof profile.fogDensityCeiling).toBe('number');
      expect(Number.isFinite(profile.fogDensityCeiling)).toBe(true);

      expect(typeof profile.volumetricBackgroundStrength).toBe('number');
      expect(Number.isFinite(profile.volumetricBackgroundStrength)).toBe(true);

      expect(typeof profile.glowIntensityMax).toBe('number');
      expect(Number.isFinite(profile.glowIntensityMax)).toBe(true);
    }
  });
});
