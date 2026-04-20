import { describe, expect, it } from 'vitest';
import { QualityGovernor } from './QualityGovernor';

describe('QualityGovernor device paths', () => {
  it('auto-detecte un profil mobile conservateur', () => {
    const governor = new QualityGovernor({
      isMobile: true,
      devicePixelRatio: 3,
      viewportWidth: 390,
      viewportHeight: 844,
    });

    expect(['safe', 'low', 'medium']).toContain(governor.getAutoDetectedProfileName());
    expect(['safe', 'low', 'medium']).toContain(governor.getActiveProfileName());
  });

  it('auto-detecte un profil desktop high/ultra', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 1.25,
      viewportWidth: 1600,
      viewportHeight: 1000,
    });

    expect(['high', 'ultra']).toContain(governor.getAutoDetectedProfileName());
    expect(['high', 'ultra']).toContain(governor.getActiveProfileName());
  });

  it('honore un forced override', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 1.25,
      viewportWidth: 1600,
      viewportHeight: 1000,
    });

    governor.setForcedProfile('safe');

    expect(governor.getActiveProfileName()).toBe('safe');
    expect(governor.getSnapshot().forcedProfile).toBe('safe');
    expect(governor.getSnapshot().source).toBe('forced');
  });

  it('revient en auto après clear override', () => {
    const governor = new QualityGovernor({
      isMobile: false,
      devicePixelRatio: 1.25,
      viewportWidth: 1600,
      viewportHeight: 1000,
      forcedProfile: 'safe',
    });

    governor.setForcedProfile(null);

    expect(governor.getSnapshot().forcedProfile).toBeNull();
    expect(governor.getSnapshot().source).not.toBe('forced');
    expect(['high', 'ultra']).toContain(governor.getActiveProfileName());
  });
});
