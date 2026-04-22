/* @vitest-environment node */

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const qualityHarness = {
  current: {
    name: 'high',
    glowIntensityMax: 1,
    partialUpdateDivisors: { fluid: 1 },
  },
};

vi.mock('../performance/QualityGovernor', () => ({
  getQualityProfileFromContext: vi.fn(() => qualityHarness.current),
}));

import {
  createInnerParticles,
  setParticlesConfig,
  animateParticles,
} from './orbParticles.js';

function createCtx() {
  const scene = new THREE.Scene();
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  return {
    scene,
    orbGroup,
    orbShellConfig: { radius: 2.2 },
    ritualGenome: {
      motion: { energy: 0.5 },
      progress: 0.5,
      rng: null,
    },
    appliedOpacityParticlesMul: 1,
    particlesConfig: {
      enabled: true,
      count: 320,
      size: 0.12,
      opacity: 0.55,
      color1: new THREE.Color(0xffffff),
      color2: new THREE.Color(0xffaa00),
      radiusFactor: 1.6,
      distribution: 'shell',
      mode: 'points',
      linkDistance: 1.2,
      trailLength: 12,
      trailFade: 0.9,
      dynamics: {
        lfoSpeed: 0.14,
        maxNeighbors: 28,
        burst: false,
      },
    },
    runtimeTelemetry: { orchestratorUpdateCount: 0 },
  } as any;
}

describe('orbParticles profile transition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    qualityHarness.current = {
      name: 'high',
      glowIntensityMax: 1,
      partialUpdateDivisors: { fluid: 1 },
    };
  });

  it('does not rebuild on count downgrade when allocated capacity is sufficient', () => {
    const ctx = createCtx();

    createInnerParticles(ctx);

    expect(ctx.particlesRuntime.rebuildCount).toBe(1);
    expect(ctx.particlesRuntime.allocatedCount).toBe(320);

    setParticlesConfig(ctx, { count: 120 });

    expect(ctx.particlesRuntime.rebuildCount).toBe(1);
    expect(ctx.particlesRuntime.allocatedCount).toBe(320);
    expect(ctx.particlesRuntime.targetCount).toBe(120);
    expect(ctx.particlesRuntime.appliedCount).toBe(120);

    animateParticles(ctx, 0.5, 0.25);

    expect(ctx.particlesPoints.geometry.drawRange.count).toBe(120);
  });

  it('rebuilds only when requested count exceeds allocated capacity', () => {
    const ctx = createCtx();

    createInnerParticles(ctx);
    expect(ctx.particlesRuntime.rebuildCount).toBe(1);
    expect(ctx.particlesRuntime.allocatedCount).toBe(320);

    setParticlesConfig(ctx, { count: 480 });

    expect(ctx.particlesRuntime.rebuildCount).toBe(2);
    expect(ctx.particlesRuntime.allocatedCount).toBe(480);
    expect(ctx.particlesRuntime.targetCount).toBe(480);
    expect(ctx.particlesRuntime.appliedCount).toBe(480);
  });
});
