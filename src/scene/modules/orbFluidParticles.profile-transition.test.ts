/* @vitest-environment node */

import * as THREE from 'three';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const qualityHarness = {
  current: {
    name: 'high',
    fluidParticleCount: 256,
    fluidUpdateRate: 1,
    partialUpdateDivisors: { fluid: 1 },
  },
};

vi.mock('../performance/QualityGovernor', () => ({
  getQualityProfileFromContext: vi.fn(() => qualityHarness.current),
}));

import {
  buildFluidParticles,
  setFluidParticlesConfig,
  updateFluidParticles,
} from './orbFluidParticles.js';

function createCtx() {
  const scene = new THREE.Scene();
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  return {
    scene,
    orbGroup,
    runtimeTelemetry: { orchestratorUpdateCount: 0 },
    ritualGenome: {
      motion: { energy: 0.5 },
      palette: {},
      rng: null,
    },
    fluidParticlesConfig: {
      enabled: true,
      maxCount: 256,
      shape: 'icosa',
      size: 0.05,
      opacity: 0.78,
      colorStart: 0xffffff,
      colorEnd: 0x88aaff,
      flowMode: 'stream',
      flowDirection: { x: 0, y: 1, z: 0 },
      flowCenter: { x: 0, y: 0, z: 0 },
      flowStrength: 1,
      gravity: -0.6,
      spawnRate: 64,
      lifetime: 3,
      speed: 1,
      spread: 0.2,
      noise: 0.1,
      burstInterval: 4,
      curlScale: 1.2,
      curlSpeed: 0.25,
      excludeFromComposer: true,
      renderLayer: 1,
    },
  } as any;
}

describe('orbFluidParticles profile transition stability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    qualityHarness.current = {
      name: 'high',
      fluidParticleCount: 256,
      fluidUpdateRate: 1,
      partialUpdateDivisors: { fluid: 1 },
    };
  });

  it('does not rebuild on downgrade while existing capacity is sufficient', () => {
    const ctx = createCtx();

    buildFluidParticles(ctx);
    expect(ctx.fluidParticlesState.rebuildCount).toBe(1);
    expect(ctx.fluidParticlesState.meshCapacity).toBe(256);

    for (let i = 0; i < 10; i += 1) {
      ctx.runtimeTelemetry.orchestratorUpdateCount += 1;
      updateFluidParticles(ctx, 0.016);
    }

    qualityHarness.current = {
      name: 'safe',
      fluidParticleCount: 64,
      fluidUpdateRate: 1,
      partialUpdateDivisors: { fluid: 1 },
    };

    setFluidParticlesConfig(ctx, {});
    ctx.runtimeTelemetry.orchestratorUpdateCount += 1;
    updateFluidParticles(ctx, 0.016);

    expect(ctx.fluidParticlesState.rebuildCount).toBe(1);
    expect(ctx.fluidParticlesState.meshCapacity).toBe(256);
    expect(ctx.fluidParticlesState.targetMaxCount).toBe(64);
    expect(ctx.fluidParticlesState.appliedMaxCount).toBe(64);
    expect(ctx.fluidParticlesState.lastProfileApplied).toBe('safe');
    expect(ctx.fluidParticlesState.activeParticleCount).toBeLessThanOrEqual(64);
  });

  it('rebuilds only when requested capacity exceeds allocated capacity', () => {
    const ctx = createCtx();

    qualityHarness.current = {
      name: 'safe',
      fluidParticleCount: 64,
      fluidUpdateRate: 1,
      partialUpdateDivisors: { fluid: 1 },
    };

    ctx.fluidParticlesConfig.maxCount = 256;
    buildFluidParticles(ctx);

    expect(ctx.fluidParticlesState.rebuildCount).toBe(1);
    expect(ctx.fluidParticlesState.meshCapacity).toBe(64);

    qualityHarness.current = {
      name: 'high',
      fluidParticleCount: 256,
      fluidUpdateRate: 1,
      partialUpdateDivisors: { fluid: 1 },
    };

    setFluidParticlesConfig(ctx, {});
    ctx.runtimeTelemetry.orchestratorUpdateCount += 1;
    updateFluidParticles(ctx, 0.016);

    expect(ctx.fluidParticlesState.rebuildCount).toBe(2);
    expect(ctx.fluidParticlesState.meshCapacity).toBe(256);
    expect(ctx.fluidParticlesState.targetMaxCount).toBe(256);
    expect(ctx.fluidParticlesState.appliedMaxCount).toBe(256);
    expect(ctx.fluidParticlesState.lastProfileApplied).toBe('high');
  });
});
