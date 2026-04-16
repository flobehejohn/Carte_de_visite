/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const orchestratorSpies = vi.hoisted(() => ({
  initRitual: vi.fn(),
  setRitualData: vi.fn(),
  updateState: vi.fn(),
  update: vi.fn(),
}));

const qualityProfileHarness = vi.hoisted(() => ({
  activeQualityProfile: 'balanced' as string | null,
  forcedQualityProfile: undefined as string | null | undefined,
  estimatedProfileCost: 1.234,
}));

const smokeAlphaHarness = vi.hoisted(() => ({
  value: 0.42 as number | null | undefined,
}));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    shadowMap = { enabled: true, type: 0 };
    toneMapping = 1;
    toneMappingExposure = 1.6;
    localClippingEnabled = false;
    autoClear = true;
    info = {
      render: {
        calls: 12,
        triangles: 2048,
        points: 512,
        lines: 128,
      },
    };

    constructor() {
      this.domElement = document.createElement('canvas');
      this.domElement.width = 800;
      this.domElement.height = 600;
      Object.defineProperty(this.domElement, 'clientWidth', {
        configurable: true,
        value: 800,
      });
      Object.defineProperty(this.domElement, 'clientHeight', {
        configurable: true,
        value: 600,
      });
    }

    setSize = vi.fn((w: number, h: number) => {
      this.domElement.width = w;
      this.domElement.height = h;
      Object.defineProperty(this.domElement, 'clientWidth', {
        configurable: true,
        value: w,
      });
      Object.defineProperty(this.domElement, 'clientHeight', {
        configurable: true,
        value: h,
      });
    });

    getSize = vi.fn((target: { x: number; y: number }) => {
      target.x = this.domElement.width || 800;
      target.y = this.domElement.height || 600;
      return target;
    });

    setPixelRatio = vi.fn();
    getPixelRatio = vi.fn(() => 1.5);
    setRenderTarget = vi.fn();
    render = vi.fn();
    clearDepth = vi.fn();
    dispose = vi.fn();
    setClearColor = vi.fn();
    clear = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', async () => {
  const THREEActual = await vi.importActual<typeof import('three')>('three');

  class EffectComposer {
    readBuffer = new THREEActual.WebGLRenderTarget(16, 16);
    writeBuffer = new THREEActual.WebGLRenderTarget(16, 16);
    renderTarget1 = new THREEActual.WebGLRenderTarget(16, 16);
    renderTarget2 = new THREEActual.WebGLRenderTarget(16, 16);
    passes: any[] = [];

    constructor(_renderer: unknown, _renderTarget?: unknown) {}

    addPass = vi.fn((pass: any) => {
      this.passes.push(pass);
    });

    render = vi.fn();
    dispose = vi.fn();
    setSize = vi.fn();
  }

  return { EffectComposer };
});

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class RenderPass {
    enabled = true;
    constructor(_scene: unknown, _camera: unknown) {}
  },
}));

vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class UnrealBloomPass {
    enabled = true;
    strength = 0.9;
    radius = 0.4;
    threshold = 0.85;

    constructor(
      _size: unknown,
      strength = 0.9,
      radius = 0.4,
      threshold = 0.85,
    ) {
      this.strength = strength;
      this.radius = radius;
      this.threshold = threshold;
    }

    setSize = vi.fn();
  },
}));

vi.mock('../../scene/modules/orbLighting', () => ({
  getLightsSnapshot: vi.fn(() => []),
}));

vi.mock('../../scene/safety/LightSafetyGovernor', () => ({
  LightSafetyGovernor: class LightSafetyGovernor {
    attach = vi.fn();
    update = vi.fn(() => null);
    dispose = vi.fn();
  },
}));

vi.mock('../../services/zarathustraService', () => ({
  getOracleTextLength: vi.fn(() => 128),
}));

vi.mock('../../shared/debug/orbDebug', () => ({
  orbLog: vi.fn(),
  orbWarn: vi.fn(),
  orbError: vi.fn(),
}));

vi.mock('../../scene/modules/orbFluidParticles.js', async () => {
  const THREEActual = await vi.importActual<typeof import('three')>('three');

  const ORB_BASE_RENDER_LAYER = 0;
  const ORB_OVERLAY_RENDER_LAYER = 1;

  function ensureFluidParticlesConfig(ctx: any) {
    ctx.fluidParticlesConfig ??= {};
    ctx.fluidParticlesConfig.excludeFromComposer ??= true;
    ctx.fluidParticlesConfig.renderLayer ??= ORB_OVERLAY_RENDER_LAYER;
    ctx.fluidParticlesConfig.enabled ??= true;
    ctx.fluidParticlesConfig.count ??= 144;
    return ctx.fluidParticlesConfig;
  }

  function resetFluidParticles(ctx: any) {
    const config = ensureFluidParticlesConfig(ctx);

    const geometry = new THREEActual.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREEActual.Float32BufferAttribute(
        new Array(config.count * 3).fill(0),
        3,
      ),
    );

    const mesh = new THREEActual.Points(
      geometry,
      new THREEActual.PointsMaterial(),
    );
    mesh.name = 'fluid-overlay';
    mesh.userData.postprocessIsolation = true;
    mesh.layers.disableAll();
    mesh.layers.enable(config.renderLayer);

    const rebuildCount = (ctx.fluidParticlesState?.rebuildCount ?? 0) + 1;
    ctx.fluidParticlesState = {
      mesh,
      rebuildCount,
    };

    ctx.particlesPoints = mesh;
    return ctx.fluidParticlesState;
  }

  return {
    ORB_BASE_RENDER_LAYER,
    ORB_OVERLAY_RENDER_LAYER,
    ensureFluidParticlesConfig,
    resetFluidParticles,
  };
});

vi.mock('../../scene/RitualOrchestrator', async () => {
  const THREEActual = await vi.importActual<typeof import('three')>('three');

  class RitualOrchestrator {
    ctx: any;
    progress = 0;
    currentState = {
      lightKey: 1,
      lightFill: 0.5,
      rim: 0.25,
      wireOpacity: 0.4,
      lightIntensity: 1,
      bloomStrength: 0.9,
      glowIntensity: 0.7,
    };
    ritualDNA = { seed: '' };

    constructor(ctx: any) {
      this.ctx = ctx;

      const orbMesh = new THREEActual.Mesh(
        new THREEActual.BoxGeometry(),
        new THREEActual.MeshBasicMaterial(),
      );
      orbMesh.name = 'OrbMesh';
      orbMesh.frustumCulled = false;
      orbMesh.layers.set(0);
      orbMesh.userData.renderAuditCategory = 'orb-solid';
      ctx.orbMesh = orbMesh;
      ctx.orbGroup.add(orbMesh);

      const wire = new THREEActual.LineSegments(
        new THREEActual.EdgesGeometry(new THREEActual.BoxGeometry()),
        new THREEActual.LineBasicMaterial(),
      );
      wire.name = 'ExoWireframe-0';
      wire.visible = true;
      wire.layers.set(0);
      ctx.wireFrames = [wire];
      ctx.orbGroup.add(wire);

      ctx.volumeConfig = {
        backgroundStrength: 0.8,
        glowIntensity: 0.6,
        softness: 0.35,
        vignette: 0.15,
      };

      ctx.particlesConfig = {
        count: 144,
        size: 0.2,
        linkDistance: 1.2,
        dynamics: 'stable',
        opacity: 0.75,
      };

      ctx.activeQualityProfile =
        qualityProfileHarness.activeQualityProfile ?? 'balanced';

      if (qualityProfileHarness.forcedQualityProfile !== undefined) {
        ctx.forcedQualityProfile = qualityProfileHarness.forcedQualityProfile;
      }

      ctx.estimatedProfileCost = qualityProfileHarness.estimatedProfileCost;

      ctx.climateTargets = {
        fogDensity: 0.003,
        bloomStrength: 0.9,
      };

      if (smokeAlphaHarness.value !== undefined) {
        ctx.smokeAlphaLayer = smokeAlphaHarness.value;
      }

      ctx.appliedSafetyFactor = 0.93;
      ctx.appliedFogDensity = 0.003;
      ctx.appliedBloomStrength = 0.9;
      ctx.appliedVignette = 0.15;
      ctx.appliedOpacityWireMul = 0.88;
      ctx.appliedOpacityParticlesMul = 0.9;
      ctx.appliedOpacityForeground = 0.95;
    }

    initRitual = orchestratorSpies.initRitual;
    setRitualData = orchestratorSpies.setRitualData;
    updateState = orchestratorSpies.updateState;
    update = orchestratorSpies.update;
  }

  return { RitualOrchestrator };
});

import { Oracle3DScene } from './Oracle3DScene';

describe('Oracle3DScene snapshot rich contract', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    qualityProfileHarness.activeQualityProfile = 'balanced';
    qualityProfileHarness.forcedQualityProfile = undefined;
    qualityProfileHarness.estimatedProfileCost = 1.234;
    smokeAlphaHarness.value = 0.42;

    container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(container, 'clientHeight', {
      configurable: true,
      value: 600,
    });

    document.body.appendChild(container);
    root = createRoot(container);

    vi.useFakeTimers();

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => setTimeout(() => cb(16), 16) as any),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => clearTimeout(id)),
    );

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock as any);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });

    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();

    delete (window as any).__ORB_AUDIT__;
    delete (window as any).__ORB_AUDIT_READY__;
    delete (window as any).__ORB_ACTIVE_SCENE__;
    delete (window as any).__DEV_VISIBLE_PROBE__;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderScene(
    props?: Partial<{
      formData: any;
      stage: number;
      loading: boolean;
      result: any;
    }>,
  ) {
    const resolvedProps = {
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
      ...props,
    };

    act(() => {
      root.render(<Oracle3DScene {...resolvedProps} />);
    });
  }

  function getAuditBridge() {
    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge).toBeDefined();
    expect(typeof bridge.ready).toBe('function');
    expect(typeof bridge.snapshot).toBe('function');
    expect(bridge.ready()).toBe(true);
    return bridge;
  }

  function expectNumberOrNull(value: unknown) {
    expect(
      value === null || (typeof value === 'number' && Number.isFinite(value)),
    ).toBe(true);
  }

  type StructuralShape =
    | 'null'
    | 'string'
    | 'number'
    | 'boolean'
    | 'array'
    | {
        [key: string]: StructuralShape;
      };

  function advanceSceneRuntime(ms = 96) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function toStructuralShape(value: unknown): StructuralShape {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';

    const valueType = typeof value;

    if (
      valueType === 'string' ||
      valueType === 'number' ||
      valueType === 'boolean'
    ) {
      return valueType;
    }

    if (valueType !== 'object') {
      return 'string';
    }

    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = toStructuralShape((value as Record<string, unknown>)[key]);
          return acc;
        },
        {} as Record<string, StructuralShape>,
      );
  }

  function snapshotStructuralSignature(snapshot: any) {
    return {
      root: Object.keys(snapshot).sort(),
      telemetry: Object.keys(snapshot.telemetry || {}).sort(),
      sceneStats: Object.keys(snapshot.sceneStats || {}).sort(),
      uiWindow: Object.keys(snapshot.uiWindow || {}).sort(),
      uiWindowLayers: Object.keys(snapshot.uiWindow?.layers || {}).sort(),
      dom: Object.keys(snapshot.dom || {}).sort(),
      fluid: Object.keys(snapshot.fluid || {}).sort(),
      shape: toStructuralShape(snapshot),
    };
  }

  function readRuntimeSnapshotVersion() {
    const activeScene = (window as any).__ORB_ACTIVE_SCENE__;
    return activeScene?.orchestrator?.ctx?.runtimeTelemetry?.snapshotVersion;
  }

  function expectQualityProfileContract(
    telemetry: any,
    expected: {
      activeQualityProfile?: string | null;
      forcedQualityProfile?: string | null;
    } = {},
  ) {
    expect(telemetry).toBeDefined();
    expect(typeof telemetry).toBe('object');

    expect(
      Object.prototype.hasOwnProperty.call(telemetry, 'activeQualityProfile'),
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(telemetry, 'forcedQualityProfile'),
    ).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(telemetry, 'estimatedProfileCost'),
    ).toBe(true);

    expect(
      telemetry.activeQualityProfile === null ||
        typeof telemetry.activeQualityProfile === 'string',
    ).toBe(true);

    expect(
      telemetry.forcedQualityProfile === null ||
        typeof telemetry.forcedQualityProfile === 'string',
    ).toBe(true);

    expect(
      typeof telemetry.estimatedProfileCost === 'number' &&
        Number.isFinite(telemetry.estimatedProfileCost),
    ).toBe(true);

    if (
      Object.prototype.hasOwnProperty.call(expected, 'activeQualityProfile')
    ) {
      expect(telemetry.activeQualityProfile).toBe(
        expected.activeQualityProfile,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(expected, 'forcedQualityProfile')
    ) {
      expect(telemetry.forcedQualityProfile).toBe(
        expected.forcedQualityProfile,
      );
    }
  }

  function expectSmokeAlphaLayerContract(
    telemetry: any,
    expected: {
      smokeAlphaLayer?: number | null;
    } = {},
  ) {
    expect(telemetry).toBeDefined();
    expect(typeof telemetry).toBe('object');

    expect(
      Object.prototype.hasOwnProperty.call(telemetry, 'smokeAlphaLayer'),
    ).toBe(true);

    expect(
      telemetry.smokeAlphaLayer === null ||
        (typeof telemetry.smokeAlphaLayer === 'number' &&
          Number.isFinite(telemetry.smokeAlphaLayer)),
    ).toBe(true);

    if (Object.prototype.hasOwnProperty.call(expected, 'smokeAlphaLayer')) {
      expect(telemetry.smokeAlphaLayer).toBe(expected.smokeAlphaLayer);
    }
  }

  it('locks the enriched telemetry structure exposed by snapshot()', () => {
    renderScene();

    advanceSceneRuntime();

    const audit = getAuditBridge();
    const snapshot = audit.snapshot();

    expect(snapshot).toBeDefined();
    expect(snapshot.telemetry).toBeDefined();
    expect(snapshot.sceneStats).toBeDefined();
    expect(snapshot.uiWindow).toBeDefined();
    expect(snapshot.dom).toBeDefined();

    const { telemetry } = snapshot;

    expect(telemetry).toEqual(
      expect.objectContaining({
        sampleCount: expect.any(Number),
        frameWindowSize: expect.any(Number),
        meanFrameTime: expect.any(Number),
        worstFrameTime: expect.any(Number),
        p50: expect.any(Number),
        p95: expect.any(Number),
        p99: expect.any(Number),
        avgFpsWindow: expect.any(Number),
        drawCalls: expect.any(Number),
        triangles: expect.any(Number),
        points: expect.any(Number),
        lines: expect.any(Number),
        dpr: expect.any(Number),
        rendererSize: expect.objectContaining({
          w: expect.any(Number),
          h: expect.any(Number),
        }),
        bloomEnabled: expect.any(Boolean),
        fogEnabled: expect.any(Boolean),
        shadowMapEnabled: expect.any(Boolean),
        fluidParticleCount: expect.any(Number),
        estimatedProfileCost: expect.any(Number),
        rebuildCount: expect.any(Number),
        resetCount: expect.any(Number),
        reinitCount: expect.any(Number),
      }),
    );

    expectNumberOrNull(telemetry.meanFrameTime);
    expectNumberOrNull(telemetry.worstFrameTime);
    expectNumberOrNull(telemetry.p50);
    expectNumberOrNull(telemetry.p95);
    expectNumberOrNull(telemetry.p99);
    expectNumberOrNull(telemetry.avgFpsWindow);

    expect(telemetry.drawCalls).toBeGreaterThanOrEqual(0);
    expect(telemetry.triangles).toBeGreaterThanOrEqual(0);
    expect(telemetry.points).toBeGreaterThanOrEqual(0);
    expect(telemetry.lines).toBeGreaterThanOrEqual(0);

    expect(telemetry.dpr).toBeGreaterThan(0);
    expect(telemetry.rendererSize.w).toBeGreaterThan(0);
    expect(telemetry.rendererSize.h).toBeGreaterThan(0);

    expect(telemetry.fluidParticleCount).toBeGreaterThanOrEqual(0);
    expect(telemetry.rebuildCount).toBeGreaterThanOrEqual(0);
    expect(telemetry.resetCount).toBeGreaterThanOrEqual(0);
    expect(telemetry.reinitCount).toBeGreaterThanOrEqual(0);

    expectQualityProfileContract(telemetry);
    expectSmokeAlphaLayerContract(telemetry, { smokeAlphaLayer: 0.42 });

    expect(snapshot.uiWindow.layers).toEqual(
      expect.objectContaining({
        composerBase: expect.any(Number),
        overlay: expect.any(Number),
      }),
    );
  });

  it('persists the rich snapshot in runtimeTelemetry.lastSnapshot with a stable version marker', () => {
    renderScene();

    advanceSceneRuntime();

    const audit = getAuditBridge();
    const snapshot = audit.snapshot();

    expect(snapshot.telemetry).toBeDefined();
    expect(snapshot.rendererInfo).toBeDefined();

    const activeScene = (window as any).__ORB_ACTIVE_SCENE__;
    expect(activeScene).toBeDefined();

    const ctx = activeScene.orchestrator?.ctx;
    expect(ctx).toBeDefined();
    expect(ctx.runtimeTelemetry).toBeDefined();
    expect(ctx.runtimeTelemetry.snapshotVersion).toBe('scene-rich-v2');
    expect(ctx.runtimeTelemetry.lastSnapshot).toBeDefined();
    expect(ctx.runtimeTelemetry.lastSnapshot.telemetry).toBeDefined();

    expect(ctx.runtimeTelemetry.lastSnapshot.telemetry).toEqual(
      expect.objectContaining({
        meanFrameTime: expect.any(Number),
        worstFrameTime: expect.any(Number),
        p50: expect.any(Number),
        p95: expect.any(Number),
        p99: expect.any(Number),
        avgFpsWindow: expect.any(Number),
        drawCalls: expect.any(Number),
        triangles: expect.any(Number),
        points: expect.any(Number),
        lines: expect.any(Number),
        dpr: expect.any(Number),
        rendererSize: expect.objectContaining({
          w: expect.any(Number),
          h: expect.any(Number),
        }),
        bloomEnabled: expect.any(Boolean),
        fogEnabled: expect.any(Boolean),
        shadowMapEnabled: expect.any(Boolean),
        fluidParticleCount: expect.any(Number),
        estimatedProfileCost: expect.any(Number),
        rebuildCount: expect.any(Number),
        resetCount: expect.any(Number),
        reinitCount: expect.any(Number),
      }),
    );

    expectQualityProfileContract(ctx.runtimeTelemetry.lastSnapshot.telemetry);
    expectSmokeAlphaLayerContract(ctx.runtimeTelemetry.lastSnapshot.telemetry, {
      smokeAlphaLayer: 0.42,
    });
  });

  it('keeps snapshot() structurally stable across reset, reseed and live reinit cycles', () => {
    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    advanceSceneRuntime();

    const audit = getAuditBridge();

    const beforeReset = audit.snapshot();
    expect(beforeReset).toBeDefined();
    expect(beforeReset.telemetry).toBeDefined();
    expect(readRuntimeSnapshotVersion()).toBe('scene-rich-v2');

    const baselineSignature = snapshotStructuralSignature(beforeReset);
    const baselineResetCount = beforeReset.telemetry.resetCount;
    const baselineReinitCount = beforeReset.telemetry.reinitCount;

    act(() => {
      audit.resetScene('snapshot-contract-reset');
      vi.advanceTimersByTime(48);
    });

    const afterReset = audit.snapshot();
    expect(afterReset).toBeDefined();
    expect(afterReset.telemetry.resetCount).toBeGreaterThan(baselineResetCount);
    expect(afterReset.telemetry.reinitCount).toBeGreaterThanOrEqual(
      baselineReinitCount,
    );
    expect(snapshotStructuralSignature(afterReset)).toEqual(baselineSignature);
    expect(readRuntimeSnapshotVersion()).toBe('scene-rich-v2');

    const afterResetCount = afterReset.telemetry.resetCount;
    const afterResetReinitCount = afterReset.telemetry.reinitCount;

    act(() => {
      audit.setSeed('beta');
      vi.advanceTimersByTime(48);
    });

    const afterReseed = audit.snapshot();
    expect(afterReseed).toBeDefined();
    expect(afterReseed.telemetry.resetCount).toBeGreaterThan(afterResetCount);
    expect(afterReseed.telemetry.reinitCount).toBeGreaterThan(
      afterResetReinitCount,
    );
    expect(snapshotStructuralSignature(afterReseed)).toEqual(baselineSignature);
    expect(readRuntimeSnapshotVersion()).toBe('scene-rich-v2');

    const afterReseedResetCount = afterReseed.telemetry.resetCount;
    const afterReseedReinitCount = afterReseed.telemetry.reinitCount;

    renderScene({
      formData: { seed: 'gamma' },
      stage: 2,
      loading: false,
      result: { seed: 'gamma', visualParams: { seed: 'gamma' } },
    });

    advanceSceneRuntime();

    const afterLiveReinit = audit.snapshot();
    expect(afterLiveReinit).toBeDefined();
    expect(afterLiveReinit.telemetry.resetCount).toBeGreaterThan(
      afterReseedResetCount,
    );
    expect(afterLiveReinit.telemetry.reinitCount).toBeGreaterThan(
      afterReseedReinitCount,
    );
    expect(snapshotStructuralSignature(afterLiveReinit)).toEqual(
      baselineSignature,
    );
    expect(readRuntimeSnapshotVersion()).toBe('scene-rich-v2');
  });

  it('keeps activeQualityProfile and forcedQualityProfile stable without a governor', () => {
    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    advanceSceneRuntime();

    const audit = getAuditBridge();

    const beforeReset = audit.snapshot();
    expectQualityProfileContract(beforeReset.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: null,
    });

    act(() => {
      audit.resetScene('quality-profile-reset');
      vi.advanceTimersByTime(48);
    });

    const afterReset = audit.snapshot();
    expectQualityProfileContract(afterReset.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: null,
    });

    act(() => {
      audit.setSeed('beta');
      vi.advanceTimersByTime(48);
    });

    const afterReseed = audit.snapshot();
    expectQualityProfileContract(afterReseed.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: null,
    });

    renderScene({
      formData: { seed: 'gamma' },
      stage: 2,
      loading: false,
      result: { seed: 'gamma', visualParams: { seed: 'gamma' } },
    });

    advanceSceneRuntime();

    const afterLiveReinit = audit.snapshot();
    expectQualityProfileContract(afterLiveReinit.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: null,
    });
  });

  it('documents forcedQualityProfile when injected without over-specifying future governor logic', () => {
    qualityProfileHarness.activeQualityProfile = 'balanced';
    qualityProfileHarness.forcedQualityProfile = 'quality-forced:test';
    qualityProfileHarness.estimatedProfileCost = 2.468;

    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    advanceSceneRuntime();

    const audit = getAuditBridge();

    const beforeReset = audit.snapshot();
    expectQualityProfileContract(beforeReset.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: 'quality-forced:test',
    });
    expect(beforeReset.telemetry.estimatedProfileCost).toBeCloseTo(2.468, 3);

    act(() => {
      audit.resetScene('forced-quality-reset');
      vi.advanceTimersByTime(48);
    });

    const afterReset = audit.snapshot();
    expectQualityProfileContract(afterReset.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: 'quality-forced:test',
    });

    act(() => {
      audit.setSeed('beta');
      vi.advanceTimersByTime(48);
    });

    const afterReseed = audit.snapshot();
    expectQualityProfileContract(afterReseed.telemetry, {
      activeQualityProfile: 'balanced',
      forcedQualityProfile: 'quality-forced:test',
    });
  });

  it('keeps smokeAlphaLayer stable when a runtime source exists', () => {
    smokeAlphaHarness.value = 0.42;

    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    advanceSceneRuntime();

    const audit = getAuditBridge();

    const beforeReset = audit.snapshot();
    expectSmokeAlphaLayerContract(beforeReset.telemetry, {
      smokeAlphaLayer: 0.42,
    });

    act(() => {
      audit.resetScene('smoke-alpha-reset');
      vi.advanceTimersByTime(48);
    });

    const afterReset = audit.snapshot();
    expectSmokeAlphaLayerContract(afterReset.telemetry, {
      smokeAlphaLayer: 0.42,
    });

    act(() => {
      audit.setSeed('beta');
      vi.advanceTimersByTime(48);
    });

    const afterReseed = audit.snapshot();
    expectSmokeAlphaLayerContract(afterReseed.telemetry, {
      smokeAlphaLayer: 0.42,
    });

    renderScene({
      formData: { seed: 'gamma' },
      stage: 2,
      loading: false,
      result: { seed: 'gamma', visualParams: { seed: 'gamma' } },
    });

    advanceSceneRuntime();

    const afterLiveReinit = audit.snapshot();
    expectSmokeAlphaLayerContract(afterLiveReinit.telemetry, {
      smokeAlphaLayer: 0.42,
    });
  });

  it('accepts smokeAlphaLayer as nullable without crash when no runtime source is present', () => {
    smokeAlphaHarness.value = undefined;

    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    advanceSceneRuntime();

    const audit = getAuditBridge();

    const beforeReset = audit.snapshot();
    expect(beforeReset).toBeDefined();
    expectSmokeAlphaLayerContract(beforeReset.telemetry, {
      smokeAlphaLayer: null,
    });

    act(() => {
      audit.resetScene('smoke-alpha-null-reset');
      vi.advanceTimersByTime(48);
    });

    const afterReset = audit.snapshot();
    expect(afterReset).toBeDefined();
    expectSmokeAlphaLayerContract(afterReset.telemetry, {
      smokeAlphaLayer: null,
    });

    act(() => {
      audit.setSeed('beta');
      vi.advanceTimersByTime(48);
    });

    const afterReseed = audit.snapshot();
    expect(afterReseed).toBeDefined();
    expectSmokeAlphaLayerContract(afterReseed.telemetry, {
      smokeAlphaLayer: null,
    });

    renderScene({
      formData: { seed: 'gamma' },
      stage: 2,
      loading: false,
      result: { seed: 'gamma', visualParams: { seed: 'gamma' } },
    });

    advanceSceneRuntime();

    const afterLiveReinit = audit.snapshot();
    expect(afterLiveReinit).toBeDefined();
    expectSmokeAlphaLayerContract(afterLiveReinit.telemetry, {
      smokeAlphaLayer: null,
    });

    const activeScene = (window as any).__ORB_ACTIVE_SCENE__;
    const ctx = activeScene?.orchestrator?.ctx;
    expect(ctx?.runtimeTelemetry?.lastSnapshot?.telemetry).toBeDefined();
    expectSmokeAlphaLayerContract(ctx.runtimeTelemetry.lastSnapshot.telemetry, {
      smokeAlphaLayer: null,
    });
  });
});
