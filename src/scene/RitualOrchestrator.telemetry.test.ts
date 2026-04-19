/* @vitest-environment jsdom */

import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  climateUpdateMock,
  climateGetTargetsMock,
  climateSetProgressMock,
  climateSetMoodMock,
  climateSetVisualParamsMock,
  climateSetSeedMock,
  climateGetRuntimeTelemetryMock,
  orbAuditCaptureStaticMock,
  applyMaterialsMock,
  mapClimateToRenderParamsMock,
  setParticlesConfigMock,
  animateParticlesMock,
  updateParticleLinksMock,
  updateParticleTrailsMock,
  setPolyConfigMock,
  updatePolyDeformationMock,
  setFluidParticlesConfigMock,
  ensureFluidParticlesConfigMock,
  buildFluidParticlesMock,
  updateFluidParticlesMock,
  setRitualConfigMock,
  createPolyhedronMock,
  setShapeTypeMock,
  setPolyDetailMock,
  setDeformAmplitudeMock,
  deformPolyhedronMock,
  initDefaultLightsMock,
  setLightConfigMock,
  updateLightsForFrameMock,
  buildGroundMock,
  updateGroundDeformationMock,
  buildOrbTextMock,
  updateOrbTextForFrameMock,
  buildVolumeMock,
  updateVolumeForFrameMock,
  setVolumeConfigMock,
  ensureVolumeConfigMock,
} = vi.hoisted(() => ({
  climateUpdateMock: vi.fn(),
  climateGetTargetsMock: vi.fn(),
  climateSetProgressMock: vi.fn(),
  climateSetMoodMock: vi.fn(),
  climateSetVisualParamsMock: vi.fn(),
  climateSetSeedMock: vi.fn(),
  climateGetRuntimeTelemetryMock: vi.fn(),

  orbAuditCaptureStaticMock: vi.fn(),

  applyMaterialsMock: vi.fn(),
  mapClimateToRenderParamsMock: vi.fn(() => ({
    opacity: {
      foregroundOpacity: 0.12,
    },
  })),

  setParticlesConfigMock: vi.fn(),
  animateParticlesMock: vi.fn(),
  updateParticleLinksMock: vi.fn(),
  updateParticleTrailsMock: vi.fn(),

  setPolyConfigMock: vi.fn(),
  updatePolyDeformationMock: vi.fn(),

  setFluidParticlesConfigMock: vi.fn(),
  ensureFluidParticlesConfigMock: vi.fn(),
  buildFluidParticlesMock: vi.fn(),
  updateFluidParticlesMock: vi.fn(),

  setRitualConfigMock: vi.fn(),
  createPolyhedronMock: vi.fn(),
  setShapeTypeMock: vi.fn(),
  setPolyDetailMock: vi.fn(),
  setDeformAmplitudeMock: vi.fn(),
  deformPolyhedronMock: vi.fn(),

  initDefaultLightsMock: vi.fn(),
  setLightConfigMock: vi.fn(),
  updateLightsForFrameMock: vi.fn(),

  buildGroundMock: vi.fn(),
  updateGroundDeformationMock: vi.fn(),

  buildOrbTextMock: vi.fn(),
  updateOrbTextForFrameMock: vi.fn(),

  buildVolumeMock: vi.fn(),
  updateVolumeForFrameMock: vi.fn(),
  setVolumeConfigMock: vi.fn(),
  ensureVolumeConfigMock: vi.fn(),
}));

vi.mock('gsap', () => ({
  default: {
    to: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('./modules/orbTextManager.js', () => ({
  OrbTextManager: vi.fn().mockImplementation(() => ({
    loadFont: vi.fn(),
    spawnOracle: vi.fn(),
    animateReveal: vi.fn(),
    clear: vi.fn(),
    revealProgress: { value: 0 },
  })),
}));

vi.mock('./audit/OrbAuditBridge.ts', () => ({
  OrbAuditBridge: class OrbAuditBridge {
    static captureRuntimeState = orbAuditCaptureStaticMock;
    hookIntoRenderer = vi.fn();
    captureRuntimeState = vi.fn();
  },
}));

vi.mock('./modules/orbParticles.js', () => ({
  setParticlesConfig: setParticlesConfigMock,
  animateParticles: animateParticlesMock,
  updateParticleLinks: updateParticleLinksMock,
  updateParticleTrails: updateParticleTrailsMock,
}));

vi.mock('./modules/orbPoly.js', () => ({
  setPolyConfig: setPolyConfigMock,
  updatePolyDeformation: updatePolyDeformationMock,
}));

vi.mock('./modules/orbFluidParticles.js', () => ({
  setFluidParticlesConfig: setFluidParticlesConfigMock,
  ensureFluidParticlesConfig: ensureFluidParticlesConfigMock,
  buildFluidParticles: buildFluidParticlesMock,
  updateFluidParticles: updateFluidParticlesMock,
}));

vi.mock('./modules/orbGeometry.js', () => ({
  setRitualConfig: setRitualConfigMock,
  createPolyhedron: createPolyhedronMock,
  setShapeType: setShapeTypeMock,
  setPolyDetail: setPolyDetailMock,
  setDeformAmplitude: setDeformAmplitudeMock,
  deformPolyhedron: deformPolyhedronMock,
  updateWireframeStyle: vi.fn(),
}));

vi.mock('./modules/orbLighting.js', () => ({
  initDefaultLights: initDefaultLightsMock,
  setLightConfig: setLightConfigMock,
  updateLightsForFrame: updateLightsForFrameMock,
}));

vi.mock('./modules/orbGround.js', () => ({
  buildGround: buildGroundMock,
  updateGroundDeformation: updateGroundDeformationMock,
}));

vi.mock('./modules/orbText.js', () => ({
  buildOrbText: buildOrbTextMock,
  updateOrbTextForFrame: updateOrbTextForFrameMock,
}));

vi.mock('./modules/orbVolumes.js', () => ({
  buildVolume: buildVolumeMock,
  updateVolumeForFrame: updateVolumeForFrameMock,
  setVolumeConfig: setVolumeConfigMock,
  ensureVolumeConfig: ensureVolumeConfigMock,
}));

vi.mock('./params/ClimateController', () => ({
  ClimateController: class ClimateController {
    setMood = climateSetMoodMock;
    setVisualParams = climateSetVisualParamsMock;
    update = climateUpdateMock;
    getTargets = climateGetTargetsMock;
    setProgress = climateSetProgressMock;
    setSeed = climateSetSeedMock;
    getRuntimeTelemetry = climateGetRuntimeTelemetryMock;
  },
}));

vi.mock('./render/materials/applyMaterials', () => ({
  applyMaterials: applyMaterialsMock,
}));

vi.mock('./render/materials/mapClimateToRenderParams', () => ({
  mapClimateToRenderParams: mapClimateToRenderParamsMock,
}));

import { RitualOrchestrator } from './RitualOrchestrator.js';

function createCtx() {
  const scene = new THREE.Scene();
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  const renderer = {
    toneMappingExposure: 1.6,
    getPixelRatio: vi.fn(() => 2),
    getSize: vi.fn(() => ({ x: 1280, y: 720 })),
  };

  const bloomPass = {
    strength: 0.9,
    radius: 0.4,
    threshold: 0.85,
  };

  const volumeConfig = {
    glowIntensity: 0.6,
    backgroundStrength: 0.25,
    softness: 0.55,
    vignette: 1.05,
    backgroundColor: new THREE.Color(0x111111),
    glowColor: new THREE.Color(0xffffff),
  };

  const ctx: any = {
    scene,
    orbGroup,
    camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
    renderer,
    bloomPass,
    baseExposure: 1.6,
    volumeConfig,
    runtimeFlags: {},
    particlesConfig: {
      mode: 'points',
      opacity: 0.6,
    },
    lightSafetyGovernor: {
      update: vi.fn(() => ({
        active: false,
        safetyFactor: 0.8,
        bloomClamp: { strength: 0.7, radius: 0.3, threshold: 0.9 },
      })),
    },
  };

  return ctx;
}

function expectFiniteNonNegativeNumber(value: unknown) {
  expect(typeof value).toBe('number');
  expect(Number.isFinite(value)).toBe(true);
  expect((value as number) >= 0).toBe(true);
}

function expectExactTimingShape(timings: Record<string, unknown>) {
  const expectedKeys = [
    'applyTargetsMs',
    'auditBridgeMs',
    'climateMs',
    'fluidMs',
    'geometryMs',
    'lightsMs',
    'materialsMs',
    'motionMs',
    'particlesMs',
    'textMs',
    'totalUpdateMs',
    'volumeMs',
  ].sort();

  expect(Object.keys(timings).sort()).toEqual(expectedKeys);

  for (const key of expectedKeys) {
    expectFiniteNonNegativeNumber(timings[key]);
  }

  const zoneKeys = expectedKeys.filter((key) => key !== 'totalUpdateMs');
  const maxZone = Math.max(...zoneKeys.map((key) => Number(timings[key])));
  expect(Number(timings.totalUpdateMs)).toBeGreaterThanOrEqual(maxZone);
}

describe('RitualOrchestrator telemetry contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    climateGetTargetsMock.mockReturnValue({
      fog: {
        enabled: true,
        density: 0.02,
        color: 0x223344,
      },
      bloom: {
        strength: 0.9,
        radius: 0.4,
        threshold: 0.85,
      },
      volume: {
        glowIntensity: 0.7,
        backgroundStrength: 0.3,
        softness: 0.5,
        vignette: 1.08,
        bgColor: new THREE.Color(0x111111),
        glowColor: new THREE.Color(0xffffff),
      },
      opacity: {
        wireOpacityMul: 0.5,
        particlesOpacityMul: 0.25,
        foregroundOpacity: 0.2,
      },
    });

    climateGetRuntimeTelemetryMock.mockReturnValue({
      version: 'climate-runtime-v1',
      updateCount: 3,
      lastProgress: 0.6,
      lastDtMs: 16,
      lastUpdatedAtMs: 1234,
      targetsVersion: 'targets-v1',
      safetyFactor: 0.8,
      appliedFogDensity: 0.02,
      appliedBloomStrength: 0.7,
      appliedVignette: 1.08,
      appliedOpacityMuls: {
        wireOpacityMul: 0.5,
        particlesOpacityMul: 0.25,
        foregroundOpacity: 0.2,
      },
      lastTargetsSnapshot:
        climateGetTargetsMock.mock.results.at(-1)?.value ?? null,
    });

    ensureVolumeConfigMock.mockImplementation((ctx: any) => ctx.volumeConfig);
    setVolumeConfigMock.mockImplementation((ctx: any, patch: any) => {
      ctx.volumeConfig = {
        ...(ctx.volumeConfig || {}),
        ...(patch || {}),
      };
      return ctx.volumeConfig;
    });

    delete (window as any).__ORACLE_3D_STATE__;
  });

  it('propage les métriques runtime d’opacité et de sécurité dans le ctx d’audit', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);

    orch.textMetrics = {
      areaRatio: 0.3,
      linesApprox: 8,
      viewportW: 1280,
    };
    orch.progress = 0.92;

    orch.applyTargetsToRuntime(
      ctx,
      {
        fog: {
          enabled: true,
          density: 0.03,
          color: 0x334455,
        },
        bloom: {
          strength: 1.1,
          radius: 0.6,
          threshold: 0.7,
        },
        volume: {
          glowIntensity: 0.8,
          backgroundStrength: 0.35,
          softness: 0.48,
          vignette: 1.12,
          bgColor: new THREE.Color(0x101820),
          glowColor: new THREE.Color(0xf8f8ff),
        },
        opacity: {
          wireOpacityMul: 0.5,
          particlesOpacityMul: 0.25,
          foregroundOpacity: 0.2,
        },
      },
      0.8,
      { strength: 0.7, radius: 0.25, threshold: 0.92 },
    );

    expect(orch._climateWireOpacityMul).toBeCloseTo(0.5);
    expect(orch._climateParticlesOpacityMul).toBeCloseTo(0.25);
    expect(typeof orch._climateForegroundOpacity).toBe('number');

    expect(ctx.appliedOpacityWireMul).toBeCloseTo(0.5);
    expect(ctx.appliedOpacityParticlesMul).toBeCloseTo(0.25);
    expect(typeof ctx.appliedOpacityForeground).toBe('number');

    expect(ctx.appliedSafetyFactor).toBeCloseTo(0.8);
    expect(typeof ctx.appliedFogDensity).toBe('number');
    expect(ctx.appliedBloomStrength).toBeCloseTo(0.7);
    expect(ctx.appliedVignette).toBeCloseTo(1.12);

    expect(ctx.bloomPass.strength).toBeCloseTo(0.7);
    expect(ctx.bloomPass.radius).toBeCloseTo(0.25);
    expect(ctx.bloomPass.threshold).toBeCloseTo(0.92);

    expect(ctx.renderer.toneMappingExposure).toBeCloseTo(1.6);
    expect(ctx.scene.fog).toBeTruthy();
  });

  it('met à jour climateController avec dt en millisecondes et expose climateTargets dans le ctx', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);

    orch.lastTime = 1.0;
    orch.progress = 0.6;

    orch.update(1.016);

    expect(climateSetProgressMock).toHaveBeenCalledWith(0.6);
    expect(climateUpdateMock).toHaveBeenCalledTimes(1);

    const dtMs = climateUpdateMock.mock.calls[0][0];
    expect(typeof dtMs).toBe('number');
    expect(dtMs).toBeGreaterThan(0);
    expect(dtMs).toBeLessThanOrEqual(50);

    expect(ctx.climateTargets).toBeDefined();
    expect(ctx.climateTargets.opacity.wireOpacityMul).toBeCloseTo(0.5);
    expect(ctx.climateTargets.opacity.particlesOpacityMul).toBeCloseTo(0.25);
  });

  it('calcule renderParams et appelle applyMaterials avec les runtime flags materials', () => {
    const ctx = createCtx();
    ctx.runtimeFlags = {
      materials: {
        enforceSingleWriter: true,
      },
    };

    const orch = new RitualOrchestrator(ctx);
    orch.lastTime = 2.0;
    orch.progress = 0.7;

    orch.update(2.016);

    expect(mapClimateToRenderParamsMock).toHaveBeenCalledTimes(1);
    expect(applyMaterialsMock).toHaveBeenCalledTimes(1);

    const [calledCtx, renderParams, dtMs, runtimeFlags] =
      applyMaterialsMock.mock.calls[0];

    expect(calledCtx).toBe(ctx);
    expect(renderParams).toEqual({
      opacity: {
        foregroundOpacity: 0.12,
      },
    });
    expect(typeof dtMs).toBe('number');
    expect(runtimeFlags).toEqual({
      enforceSingleWriter: true,
    });

    expect(ctx.renderParams).toEqual({
      opacity: {
        foregroundOpacity: 0.12,
      },
    });
  });

  it('utilise le bridge d’instance s’il existe pour capturer la télémétrie runtime', () => {
    const ctx = createCtx();
    const instanceCapture = vi.fn();

    const orch = new RitualOrchestrator(ctx);
    ctx.orbAuditBridge = {
      captureRuntimeState: instanceCapture,
    };

    orch.lastTime = 3.0;
    orch.update(3.016);

    expect(instanceCapture).toHaveBeenCalledTimes(1);
    expect(orbAuditCaptureStaticMock).not.toHaveBeenCalled();
  });

  it('retombe sur OrbAuditBridge.captureRuntimeState(ctx) quand aucun bridge d’instance n’est présent', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);

    delete ctx.orbAuditBridge;

    orch.lastTime = 4.0;
    orch.update(4.016);

    expect(orbAuditCaptureStaticMock).toHaveBeenCalledTimes(1);
    expect(orbAuditCaptureStaticMock).toHaveBeenCalledWith(ctx);
  });

  it('propage safetyFactor et bloomClamp issus du gouverneur lumière dans les métriques runtime', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);

    ctx.lightSafetyGovernor = {
      update: vi.fn(() => ({
        active: true,
        safetyFactor: 0.5,
        bloomClamp: {
          strength: 0.6,
          radius: 0.2,
          threshold: 0.95,
        },
      })),
    };

    orch.lastTime = 5.0;
    orch.progress = 0.8;

    orch.update(5.016);

    expect(ctx.safetyFactor).toBeCloseTo(0.5);
    expect(ctx.appliedSafetyFactor).toBeCloseTo(0.5);
    expect(ctx.appliedBloomStrength).toBeCloseTo(0.6);
    expect(ctx.bloomPass.strength).toBeCloseTo(0.6);
    expect(ctx.bloomPass.radius).toBeCloseTo(0.2);
    expect(ctx.bloomPass.threshold).toBeCloseTo(0.95);
  });

  it('expose les timings par zone dans ctx.runtimeTelemetry.orchestratorTimings avec une forme stable et finie', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);

    orch.lastTime = 6.0;
    orch.progress = 0.65;

    orch.update(6.016);

    expect(ctx.runtimeTelemetry).toBeDefined();
    expect(ctx.runtimeTelemetry.orchestratorUpdateCount).toBeGreaterThanOrEqual(
      1,
    );
    expectFiniteNonNegativeNumber(ctx.runtimeTelemetry.lastOrchestratorDtMs);
    expect(ctx.runtimeTelemetry.lastOrchestratorTime).toBeCloseTo(6.016);

    expect(ctx.runtimeTelemetry.orchestratorTimings).toBeDefined();
    expectExactTimingShape(ctx.runtimeTelemetry.orchestratorTimings);
  });

  it('normalise un bloc runtimeTelemetry partiel et réémet un contrat timings complet après update', () => {
    const ctx = createCtx();
    ctx.runtimeTelemetry = {
      orchestratorUpdateCount: 5,
      lastOrchestratorDtMs: 999,
      lastOrchestratorTime: 9.99,
      orchestratorTimings: {
        climateMs: 42,
      },
    };

    const orch = new RitualOrchestrator(ctx);

    expect(ctx.runtimeTelemetry.orchestratorUpdateCount).toBe(5);
    expect(ctx.runtimeTelemetry.orchestratorTimings).toBeDefined();
    expect(
      Object.keys(ctx.runtimeTelemetry.orchestratorTimings).sort(),
    ).toEqual(
      [
        'applyTargetsMs',
        'auditBridgeMs',
        'climateMs',
        'fluidMs',
        'geometryMs',
        'lightsMs',
        'materialsMs',
        'motionMs',
        'particlesMs',
        'textMs',
        'totalUpdateMs',
        'volumeMs',
      ].sort(),
    );

    orch.lastTime = 7.0;
    orch.progress = 0.55;
    orch.update(7.016);

    expect(ctx.runtimeTelemetry.orchestratorUpdateCount).toBeGreaterThanOrEqual(
      6,
    );
    expectFiniteNonNegativeNumber(ctx.runtimeTelemetry.lastOrchestratorDtMs);
    expect(ctx.runtimeTelemetry.lastOrchestratorTime).toBeCloseTo(7.016);
    expectExactTimingShape(ctx.runtimeTelemetry.orchestratorTimings);
  });

  it('expose des profils qualité explicites et un diagnostic de timings attribuable', () => {
    const ctx = createCtx();
    ctx.qualityProfiles = {
      current: 'desktop-standard',
      forced: null,
      estimatedCost: 1.25,
    };

    const orch = new RitualOrchestrator(ctx);
    orch.lastTime = 8.0;
    orch.progress = 0.88;
    orch.hatchPulse = 0.3;

    orch.update(8.016);

    expect(ctx.qualityProfile).toBe('desktop-standard');
    expect(ctx.activeQualityProfile).toBe('desktop-standard');
    expect(ctx.forcedQualityProfile).toBeNull();
    expect(ctx.qualityProfileSource).toBe('auto-detected');
    expect(ctx.dprBucket).toBe('high');
    expect(ctx.deviceClass).toBe('desktop');
    expect(ctx.rendererArea).toBe(921600);

    expect(ctx.runtimeTelemetry.qualityProfiles).toMatchObject({
      current: 'desktop-standard',
      active: 'desktop-standard',
      source: 'auto-detected',
      dprBucket: 'high',
      deviceClass: 'desktop',
      rendererArea: 921600,
    });

    expect(ctx.timingDiagnostics).toBeDefined();
    expectFiniteNonNegativeNumber(ctx.timingDiagnostics.bootElapsedMs);
    expect(typeof ctx.timingDiagnostics.isWarmup).toBe('boolean');
    expect(['boot', 'warming', 'steady']).toContain(
      ctx.timingDiagnostics.warmupPhase,
    );
    expect(typeof ctx.timingDiagnostics.dominantTimingKey).toBe('string');
    expectFiniteNonNegativeNumber(ctx.timingDiagnostics.dominantTimingMs);
    expect(ctx.timingDiagnostics.recentRebuilds).toMatchObject({
      geometry: expect.any(Boolean),
      fluid: expect.any(Boolean),
      materials: expect.any(Boolean),
    });
  });
});