import { describe, expect, it } from 'vitest';
import * as orbFluidParticles from './orbFluidParticles.js';

describe('orbFluidParticles public contract', () => {
  it('exposes the phase 1 public API', () => {
    expect(orbFluidParticles).toMatchObject({
      ORB_BASE_RENDER_LAYER: expect.any(Number),
      ORB_OVERLAY_RENDER_LAYER: expect.any(Number),
      ensureFluidParticlesConfig: expect.any(Function),
      resetFluidParticles: expect.any(Function),
      setFluidParticlesEnabled: expect.any(Function),
      setFluidParticlesConfig: expect.any(Function),
      updateFluidParticles: expect.any(Function),
    });
  });

  it('keeps base and overlay layers distinct', () => {
    expect(Number.isFinite(orbFluidParticles.ORB_BASE_RENDER_LAYER)).toBe(true);
    expect(Number.isFinite(orbFluidParticles.ORB_OVERLAY_RENDER_LAYER)).toBe(
      true,
    );
    expect(orbFluidParticles.ORB_BASE_RENDER_LAYER).not.toBe(
      orbFluidParticles.ORB_OVERLAY_RENDER_LAYER,
    );
  });
});
