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

      ctx.activeQualityProfile = 'balanced';
      ctx.estimatedProfileCost = 1.234;
      ctx.climateTargets = {
        fogDensity: 0.003,
        bloomStrength: 0.9,
      };

      ctx.smokeAlphaLayer = 0.42;
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

  it('locks the enriched telemetry structure exposed by snapshot()', () => {
    renderScene();

    act(() => {
      vi.advanceTimersByTime(96);
    });

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
        meanFrameTime: expect.anything(),
        worstFrameTime: expect.anything(),
        p50: expect.anything(),
        p95: expect.anything(),
        p99: expect.anything(),
        avgFpsWindow: expect.anything(),
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
        activeQualityProfile: expect.anything(),
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

    expect(
      typeof telemetry.activeQualityProfile === 'string' ||
        telemetry.activeQualityProfile === null,
    ).toBe(true);

    expect(snapshot.uiWindow.layers).toEqual(
      expect.objectContaining({
        composerBase: expect.any(Number),
        overlay: expect.any(Number),
      }),
    );
  });

  it('persists the rich snapshot in runtimeTelemetry.lastSnapshot with a stable version marker', () => {
    renderScene();

    act(() => {
      vi.advanceTimersByTime(96);
    });

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
        meanFrameTime: expect.anything(),
        worstFrameTime: expect.anything(),
        p50: expect.anything(),
        p95: expect.anything(),
        p99: expect.anything(),
        avgFpsWindow: expect.anything(),
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
        activeQualityProfile: expect.anything(),
        estimatedProfileCost: expect.any(Number),
        rebuildCount: expect.any(Number),
        resetCount: expect.any(Number),
        reinitCount: expect.any(Number),
      }),
    );
  });
});
