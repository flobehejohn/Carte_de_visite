import { describe, it, expect } from 'vitest';
import {
  applyHysteresis,
  computeAlpha,
  computeTransparencyPolicy,
  type TransparencyOptions,
  type TransparencyState,
} from './transparency';

const OPTS: TransparencyOptions = {
  minAlpha: 0,
  maxAlpha: 1,
  tauMs: 200,
  hysteresisUp: 0.02,
  hysteresisDown: 0.02,
};

describe('transparency helpers', () => {
  it('clamps alpha to configured range', () => {
    const prev: TransparencyState = { stableAlpha: 0.2, smoothedAlpha: 0.2 };
    const result = computeAlpha(2, 2, 2, prev, 50, {
      ...OPTS,
      minAlpha: 0.1,
      maxAlpha: 0.9,
    });

    expect(result.alpha).toBeGreaterThanOrEqual(0.1);
    expect(result.alpha).toBeLessThanOrEqual(0.9);
  });

  it('hysteresis prevents small oscillations', () => {
    const prevStable = 0.5;
    expect(applyHysteresis(prevStable, 0.51, 0.02, 0.02)).toBe(prevStable);
    expect(applyHysteresis(prevStable, 0.53, 0.02, 0.02)).toBe(0.53);
    expect(applyHysteresis(prevStable, 0.49, 0.02, 0.02)).toBe(prevStable);
  });

  it('smoothing moves toward target without overshoot', () => {
    const prev: TransparencyState = { stableAlpha: 0.2, smoothedAlpha: 0.2 };
    const first = computeAlpha(1, 1, 1, prev, 50, OPTS);
    expect(first.alpha).toBeGreaterThan(0.2);
    expect(first.alpha).toBeLessThanOrEqual(1);

    const second = computeAlpha(1, 1, 1, first.nextState, 50, OPTS);
    expect(second.alpha).toBeGreaterThan(first.alpha);
    expect(second.alpha).toBeLessThanOrEqual(1);
  });

  it('policy treats alpha 1 as opaque and others as transparent', () => {
    const config = {
      opaqueOrder: 0,
      transparentOrder: 10,
      depthWriteTransparent: false,
      depthTestTransparent: true,
      alphaTest: 0.1,
    };

    const opaque = computeTransparencyPolicy(1, config);
    expect(opaque.depthWrite).toBe(true);
    expect(opaque.renderOrder).toBe(0);
    expect(opaque.dithering).toBe(false);

    const transparent = computeTransparencyPolicy(0.5, config);
    expect(transparent.depthWrite).toBe(false);
    expect(transparent.depthTest).toBe(true);
    expect(transparent.renderOrder).toBe(10);
    expect(transparent.dithering).toBe(true);
    expect(transparent.alphaTest).toBe(0.1);
  });
});
