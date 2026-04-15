/* @vitest-environment node */

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildFluidParticles,
    resetFluidParticles,
    setFluidParticlesConfig,
    updateFluidParticles,
} from './orbFluidParticles.js';

type TestFluidParticlesState = {
  rebuildCount: number;
  activeParticleCount: number;
  lastUpdateMs: number | null;
  avgUpdateMs: number | null;
  updateCount: number;
  mesh?: THREE.InstancedMesh | null;
  particles?: unknown[];
};

type TestFluidCtx = {
  scene: THREE.Scene;
  orbGroup: THREE.Group;
  ritualGenome: {
    motion: { energy: number };
    palette: Record<string, unknown>;
  };
  fluidParticlesConfig: {
    enabled: boolean;
    maxCount: number;
    spawnRate: number;
    lifetime: number;
    speed: number;
    spread: number;
    noise: number;
    flowMode: string;
    flowDirection: { x: number; y: number; z: number };
    flowCenter: { x: number; y: number; z: number };
    excludeFromComposer: boolean;
    renderLayer: number;
  };
  fluidParticlesState?: TestFluidParticlesState;
  fluidParticles?: unknown;
};

function createCtx(): TestFluidCtx {
  const scene = new THREE.Scene();
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  return {
    scene,
    orbGroup,
    ritualGenome: {
      motion: { energy: 0.5 },
      palette: {},
    },
    fluidParticlesConfig: {
      enabled: true,
      maxCount: 32,
      spawnRate: 20,
      lifetime: 3,
      speed: 1,
      spread: 0.2,
      noise: 0.1,
      flowMode: 'stream',
      flowDirection: { x: 0, y: 1, z: 0 },
      flowCenter: { x: 0, y: 0, z: 0 },
      excludeFromComposer: true,
      renderLayer: 1,
    },
  };
}

function expectFiniteNonNegative(value: unknown, label: string) {
  expect(
    typeof value === 'number' && Number.isFinite(value) && value >= 0,
    `${label} must be a finite non-negative number`,
  ).toBe(true);
}

describe('orbFluidParticles runtime telemetry contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes a stable runtime state when the mesh is built', () => {
    const ctx = createCtx();

    buildFluidParticles(ctx);

    expect(ctx.fluidParticlesState).toBeDefined();
    expect(ctx.fluidParticlesState).toEqual(
      expect.objectContaining({
        rebuildCount: 1,
        activeParticleCount: 0,
        lastUpdateMs: null,
        avgUpdateMs: null,
        updateCount: 0,
      }),
    );
  });

  it('updates activeParticleCount and timing counters on each update', () => {
    const ctx = createCtx();

    buildFluidParticles(ctx);

    // Horloge monotone : on ne vérifie pas une valeur exacte,
    // seulement la cohérence du contrat runtime.
    let tick = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      tick += 0.5;
      return tick;
    });

    updateFluidParticles(ctx, 0.2);

    expect(ctx.fluidParticlesState).toBeDefined();
    expect(ctx.fluidParticlesState!.updateCount).toBe(1);
    expectFiniteNonNegative(
      ctx.fluidParticlesState!.lastUpdateMs,
      'lastUpdateMs after first update',
    );
    expect(ctx.fluidParticlesState!.avgUpdateMs).toBe(
      ctx.fluidParticlesState!.lastUpdateMs,
    );
    expect(ctx.fluidParticlesState!.activeParticleCount).toBeGreaterThan(0);

    const firstActiveCount = ctx.fluidParticlesState!.activeParticleCount;
    const firstLastUpdateMs = ctx.fluidParticlesState!.lastUpdateMs as number;

    updateFluidParticles(ctx, 0.2);

    expect(ctx.fluidParticlesState!.updateCount).toBe(2);
    expectFiniteNonNegative(
      ctx.fluidParticlesState!.lastUpdateMs,
      'lastUpdateMs after second update',
    );
    expectFiniteNonNegative(
      ctx.fluidParticlesState!.avgUpdateMs,
      'avgUpdateMs after second update',
    );

    const secondLastUpdateMs = ctx.fluidParticlesState!.lastUpdateMs as number;
    const avgUpdateMs = ctx.fluidParticlesState!.avgUpdateMs as number;

    expect(avgUpdateMs).toBeGreaterThanOrEqual(
      Math.min(firstLastUpdateMs, secondLastUpdateMs),
    );
    expect(avgUpdateMs).toBeLessThanOrEqual(
      Math.max(firstLastUpdateMs, secondLastUpdateMs),
    );

    expect(ctx.fluidParticlesState!.activeParticleCount).toBeGreaterThanOrEqual(
      firstActiveCount,
    );
  });

  it('keeps the runtime contract stable when disabled and reset', () => {
    const ctx = createCtx();

    buildFluidParticles(ctx);

    let tick = 300;
    vi.spyOn(performance, 'now').mockImplementation(() => {
      tick += 0.25;
      return tick;
    });

    setFluidParticlesConfig(ctx, { enabled: false });
    updateFluidParticles(ctx, 0.16);

    expect(ctx.fluidParticlesState).toBeDefined();
    expect(ctx.fluidParticlesState!.updateCount).toBe(1);
    expect(ctx.fluidParticlesState!.activeParticleCount).toBe(0);
    expectFiniteNonNegative(
      ctx.fluidParticlesState!.lastUpdateMs,
      'lastUpdateMs when disabled',
    );
    expect(ctx.fluidParticlesState!.avgUpdateMs).toBe(
      ctx.fluidParticlesState!.lastUpdateMs,
    );

    resetFluidParticles(ctx);

    expect(ctx.fluidParticlesState!.rebuildCount).toBeGreaterThanOrEqual(1);
    expect(ctx.fluidParticlesState!.activeParticleCount).toBe(0);
    expect(ctx.fluidParticlesState!.updateCount).toBe(1);
    expect(ctx.fluidParticlesState!.lastUpdateMs).not.toBeNull();
    expect(ctx.fluidParticlesState!.avgUpdateMs).not.toBeNull();
  });
});
