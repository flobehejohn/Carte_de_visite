import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { applyMaterialsMock } = vi.hoisted(() => ({
  applyMaterialsMock: vi.fn(),
}));

vi.mock('./modules/orbFluidParticles.js', () => ({
  setFluidParticlesConfig: vi.fn(),
  updateFluidParticles: vi.fn(),
}));

vi.mock('./modules/orbGeometry.js', () => ({
  setRitualConfig: vi.fn(),
  createPolyhedron: vi.fn(),
  setDeformAmplitude: vi.fn(),
  deformPolyhedron: vi.fn(),
  updateWireframeStyle: vi.fn(),
  setShapeType: vi.fn(),
  setPolyDetail: vi.fn(),
}));

vi.mock('./modules/orbGround.js', () => ({
  buildGround: vi.fn(),
  updateGroundDeformation: vi.fn(),
}));

vi.mock('./modules/orbLighting.js', () => ({
  initDefaultLights: vi.fn(),
  setLightConfig: vi.fn(),
  updateLightsForFrame: vi.fn(),
}));

vi.mock('./modules/orbParticles.js', () => ({
  setParticlesConfig: vi.fn(),
  animateParticles: vi.fn(),
  updateParticleLinks: vi.fn(),
  updateParticleTrails: vi.fn(),
}));

vi.mock('./modules/orbPoly.js', () => ({
  setPolyConfig: vi.fn(),
  updatePolyDeformation: vi.fn(),
}));

vi.mock('./modules/orbVolumes.js', () => ({
  buildVolume: vi.fn(),
  ensureVolumeConfig: vi.fn(() => ({
    glowIntensity: 0.2,
    backgroundStrength: 0.2,
  })),
  updateVolumeForFrame: vi.fn(),
  setVolumeConfig: vi.fn(),
}));

vi.mock('./params/ClimateController', () => ({
  ClimateController: class {
    setMood() {}
    setVisualParams() {}
    setProgress() {}
    update() {}
    getTargets() {
      return {
        fog: { enabled: true, density: 0.01, color: 0x000000 },
        bloom: { strength: 0.2, radius: 0.1, threshold: 0.9 },
        volume: {
          glowIntensity: 0.2,
          backgroundStrength: 0.2,
          softness: 0.5,
          vignette: 1.0,
        },
        opacity: {
          wireOpacityMul: 1,
          particlesOpacityMul: 1,
          foregroundOpacity: 0,
        },
      };
    }
  },
}));

vi.mock('./render/materials/applyMaterials', () => ({
  applyMaterials: applyMaterialsMock,
}));

vi.mock('./render/materials/mapClimateToRenderParams', () => ({
  mapClimateToRenderParams: vi.fn(() => ({
    opacity: { foregroundOpacity: 0 },
  })),
}));

import { RitualOrchestrator } from './RitualOrchestrator.js';

function createCtx() {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    renderer: { toneMappingExposure: 1.14 },
    orbGroup: new THREE.Group(),
    lightsRegistry: new Map(),
    lightSafetyGovernor: {
      update: () => ({ safetyFactor: 1, bloomClamp: null }),
    },
    renderParams: null,
    volumeConfig: { glowIntensity: 0.2, backgroundStrength: 0.2 },
    bloomPass: { strength: 0.2, radius: 0.1, threshold: 0.9 },
    baseExposure: 1.14,
    runtimeFlags: undefined,
  };
}

function primeOrchestrator(orch) {
  orch.currentState = {
    ...orch.currentState,
    lightKey: 0.2,
    lightFill: 0.1,
    rim: 0.05,
    wireOpacity: 0.3,
    deformBase: 0,
    deformPulse: 0,
    dislocation: 0,
    turbulence: 0.1,
    glowIntensity: 0.2,
    backgroundStrength: 0.2,
    softness: 0.5,
    orbScale: 1,
    orbYOffset: 0,
    orbZOffset: 0,
    spinSpeed: 0,
    wobble: 0,
    foregroundOpacity: 0,
    lightColor: new THREE.Color(0xffffff),
    bgColor: new THREE.Color(0x000000),
    wireColor: new THREE.Color(0xffffff),
  };

  orch.targetState = { ...orch.currentState };

  orch.ctx.ritualGenome = {
    geometry: { turbulence: 0.1 },
    lighting: { drift: 0.2, warmth: 0 },
    motion: { energy: 0.1 },
    particles: {
      dynamics: { lfoSpeed: 0.1 },
      opacity: 0.2,
      linkDistance: 1,
    },
    palette: { accent: new THREE.Color(0xffffff) },
  };

  orch.ctx.climateTargets = {
    fog: { enabled: true, density: 0.01, color: 0x000000 },
    bloom: { strength: 0.2, radius: 0.1, threshold: 0.9 },
    volume: {
      glowIntensity: 0.2,
      backgroundStrength: 0.2,
      softness: 0.5,
      vignette: 1.0,
    },
    opacity: {
      wireOpacityMul: 1,
      particlesOpacityMul: 1,
      foregroundOpacity: 0,
    },
  };
}

describe('RitualOrchestrator materials runtime flags guard', () => {
  beforeEach(() => {
    applyMaterialsMock.mockClear();
  });

  it('n explose pas si runtimeFlags est absent et transmet null a applyMaterials', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);
    primeOrchestrator(orch);

    expect(() => orch.update(1)).not.toThrow();
    expect(applyMaterialsMock).toHaveBeenCalled();
    expect(applyMaterialsMock.mock.calls.at(-1)?.[3]).toBeNull();
  });

  it('transmet runtimeFlags.materials quand il existe', () => {
    const ctx = createCtx();
    ctx.runtimeFlags = {
      materials: {
        safeMode: true,
        source: 'unit-test',
      },
    };

    const orch = new RitualOrchestrator(ctx);
    primeOrchestrator(orch);

    orch.update(1);

    expect(applyMaterialsMock).toHaveBeenCalled();
    expect(applyMaterialsMock.mock.calls.at(-1)?.[3]).toEqual({
      safeMode: true,
      source: 'unit-test',
    });
  });
});
