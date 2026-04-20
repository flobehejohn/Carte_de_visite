import { describe, expect, it } from 'vitest';
import { QualityGovernor } from './QualityGovernor';

const BAD_FRAME = {
  totalUpdateMs: 28,
  fluidMs: 11,
  geometryMs: 8,
  volumeMs: 7,
  textMs: 2,
  hasUsefulShadowCaster: true,
};

const GOOD_FRAME = {
  totalUpdateMs: 8,
  fluidMs: 2,
  geometryMs: 1.5,
  volumeMs: 1.2,
  textMs: 0.4,
  hasUsefulShadowCaster: false,
};

describe('QualityGovernor hysteresis', () => {
  it('downgrade après N frames dégradées consécutives', () => {
    const governor = new QualityGovernor({
      initialProfile: 'high',
      downgradeAfterFrames: 3,
      upgradeAfterFrames: 8,
      cooldownFrames: 4,
    });

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('high');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('high');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    const snapshot = governor.getSnapshot();
    expect(snapshot.source).toBe('runtime-budget');
    expect(snapshot.hysteresis.cooldownFramesRemaining).toBe(4);
  });

  it('n upgrade pas trop vite : fenêtre plus longue que le downgrade', () => {
    const governor = new QualityGovernor({
      initialProfile: 'low',
      downgradeAfterFrames: 2,
      upgradeAfterFrames: 5,
      cooldownFrames: 0,
    });

    for (let i = 0; i < 4; i += 1) {
      governor.observe(GOOD_FRAME);
    }

    expect(governor.getActiveProfileName()).toBe('low');

    governor.observe(GOOD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');
  });

  it('applique un cooldown explicite pour éviter le pompage', () => {
    const governor = new QualityGovernor({
      initialProfile: 'high',
      downgradeAfterFrames: 2,
      upgradeAfterFrames: 5,
      cooldownFrames: 3,
    });

    governor.observe(BAD_FRAME);
    governor.observe(BAD_FRAME);

    expect(governor.getActiveProfileName()).toBe('medium');
    expect(governor.getSnapshot().hysteresis.cooldownFramesRemaining).toBe(3);

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('low');
  });

  it('ne change que d un cran à la fois', () => {
    const governor = new QualityGovernor({
      initialProfile: 'ultra',
      downgradeAfterFrames: 1,
      upgradeAfterFrames: 1,
      cooldownFrames: 0,
    });

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('high');

    governor.observe(BAD_FRAME);
    expect(governor.getActiveProfileName()).toBe('medium');

    governor.observe(GOOD_FRAME);
    expect(governor.getActiveProfileName()).toBe('high');
  });
});
