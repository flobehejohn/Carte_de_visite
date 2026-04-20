import { describe, expect, it } from 'vitest';
import {
  QUALITY_PROFILES,
  QualityGovernor,
  detectQualityProfileFromDevice,
  estimateProfileCost,
  resolveShadowMapEnabled,
  writeQualitySnapshotToContext,
} from './QualityGovernor';

describe('QualityGovernor', () => {
  it('sélectionne un profil mobile conservateur pour DPR élevé', () => {
    expect(
      detectQualityProfileFromDevice({
        isMobile: true,
        devicePixelRatio: 3,
        viewportWidth: 390,
        viewportHeight: 844,
      }),
    ).toBe('low');
  });

  it('sélectionne un profil desktop élevé sur machine confortable', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 1.25,
      viewportWidth: 1600,
      viewportHeight: 1000,
    });

    expect(governor.getAutoDetectedProfileName()).toBe('ultra');
    expect(governor.getActiveProfileName()).toBe('ultra');
  });

  it('respecte le profil forcé et expose un snapshot explicite', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 2,
      forcedProfile: 'safe',
    });

    const snapshot = governor.getSnapshot();

    expect(snapshot.activeProfile).toBe('safe');
    expect(snapshot.forcedProfile).toBe('safe');
    expect(snapshot.source).toBe('forced');
    expect(snapshot.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(snapshot.profile.name).toBe('safe');
  });

  it('désactive réellement shadowMap si aucune lumière utile ne caste des ombres', () => {
    expect(resolveShadowMapEnabled(true, false)).toBe(false);
    expect(resolveShadowMapEnabled(true, 0)).toBe(false);
    expect(resolveShadowMapEnabled(true, 1)).toBe(true);
    expect(resolveShadowMapEnabled(false, true)).toBe(false);
  });

  it('publie le snapshot dans le contexte runtime', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 2,
    });

    const ctx: Record<string, any> = { runtime: {} };
    const snapshot = writeQualitySnapshotToContext(ctx, governor);

    expect(ctx.runtime.quality.activeProfile).toBe(snapshot.activeProfile);
    expect(ctx.runtime.qualityProfileName).toBe(snapshot.activeProfile);
    expect(ctx.runtime.qualitySource).toBe(snapshot.source);
    expect(ctx.runtime.qualityProfile.maxDpr).toBe(
      QUALITY_PROFILES[snapshot.activeProfile].maxDpr,
    );
    expect(ctx.qualityProfileName).toBe(snapshot.activeProfile);
  });

  it('évalue un coût croissant avec les profils plus riches', () => {
    const safeCost = estimateProfileCost(QUALITY_PROFILES.safe);
    const lowCost = estimateProfileCost(QUALITY_PROFILES.low);
    const mediumCost = estimateProfileCost(QUALITY_PROFILES.medium);
    const highCost = estimateProfileCost(QUALITY_PROFILES.high);
    const ultraCost = estimateProfileCost(QUALITY_PROFILES.ultra);

    expect(safeCost).toBeLessThan(lowCost);
    expect(lowCost).toBeLessThan(mediumCost);
    expect(mediumCost).toBeLessThan(highCost);
    expect(highCost).toBeLessThanOrEqual(ultraCost);
  });
});
