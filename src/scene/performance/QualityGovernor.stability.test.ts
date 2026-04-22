import { describe, expect, it } from 'vitest';
import { QualityGovernor } from './QualityGovernor';

describe('QualityGovernor stability', () => {
  it('respecte le cooldown avant toute nouvelle transition', () => {
    const governor = new QualityGovernor({
      initialProfile: 'high',
      isMobile: false,
      devicePixelRatio: 1.5,
      viewportWidth: 1440,
      viewportHeight: 900,
      downgradeAfterFrames: 2,
      upgradeAfterFrames: 4,
      cooldownFrames: 3,
    });

    const bad = {
      totalUpdateMs: 42,
      fluidMs: 12,
      geometryMs: 10,
      volumeMs: 8,
      textMs: 5,
    };

    const good = {
      totalUpdateMs: 8,
      fluidMs: 1,
      geometryMs: 1,
      volumeMs: 1,
      textMs: 0.5,
    };

    expect(governor.getActiveProfileName()).toBe('high');

    governor.observe(bad);
    const afterDowngrade = governor.observe(bad);

    expect(afterDowngrade.activeProfile).toBe('medium');
    expect(afterDowngrade.source).toBe('runtime-budget');
    expect(afterDowngrade.hysteresis.cooldownFramesRemaining).toBe(3);

    const c1 = governor.observe(good);
    const c2 = governor.observe(good);
    const c3 = governor.observe(good);

    expect(c1.activeProfile).toBe('medium');
    expect(c2.activeProfile).toBe('medium');
    expect(c3.activeProfile).toBe('medium');

    governor.observe(good);
    governor.observe(good);
    governor.observe(good);
    const afterUpgrade = governor.observe(good);

    expect(afterUpgrade.activeProfile).toBe('high');
    expect(afterUpgrade.hysteresis.cooldownFramesRemaining).toBe(3);
  });

  it('gèle le profil quand il est forcé', () => {
    const governor = new QualityGovernor({
      initialProfile: 'medium',
      isMobile: false,
      devicePixelRatio: 1.5,
      viewportWidth: 1440,
      viewportHeight: 900,
      downgradeAfterFrames: 2,
      upgradeAfterFrames: 2,
      cooldownFrames: 2,
    });

    governor.setForcedProfile('safe');

    const samples = [
      governor.observe({ totalUpdateMs: 60, fluidMs: 20, geometryMs: 12, volumeMs: 10, textMs: 6 }),
      governor.observe({ totalUpdateMs: 6, fluidMs: 1, geometryMs: 1, volumeMs: 1, textMs: 0 }),
      governor.observe({ totalUpdateMs: 55, fluidMs: 18, geometryMs: 12, volumeMs: 9, textMs: 5 }),
    ];

    for (const snapshot of samples) {
      expect(snapshot.activeProfile).toBe('safe');
      expect(snapshot.forcedProfile).toBe('safe');
      expect(snapshot.source).toBe('forced');
    }
  });
});
