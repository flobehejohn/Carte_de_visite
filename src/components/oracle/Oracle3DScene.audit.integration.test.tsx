/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auditState = vi.hoisted(() => ({
  injectFeedbackMesh: false,
}));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;
    localClippingEnabled = false;
    autoClear = true;
    info = { render: {} };

    constructor() {
      this.domElement = document.createElement('canvas');
    }

    setSize = vi.fn();
    setPixelRatio = vi.fn();
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

    constructor(_renderer: unknown) {}

    addPass = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    setSize = vi.fn();
  }

  return { EffectComposer };
});

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class RenderPass {
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

vi.mock('../../scene/modules/orbFluidParticles.js', async () => {
  const THREEActual = await vi.importActual<typeof import('three')>('three');

  const ORB_BASE_RENDER_LAYER = 0;
  const ORB_OVERLAY_RENDER_LAYER = 1;

  function ensureFluidParticlesConfig(ctx: any) {
    ctx.fluidParticlesConfig ??= {};
    ctx.fluidParticlesConfig.excludeFromComposer ??= true;
    ctx.fluidParticlesConfig.renderLayer ??= ORB_OVERLAY_RENDER_LAYER;
    ctx.fluidParticlesConfig.enabled ??= true;
    return ctx.fluidParticlesConfig;
  }

  function resetFluidParticles(ctx: any) {
    const config = ensureFluidParticlesConfig(ctx);
    const mesh = new THREEActual.Points(
      new THREEActual.BufferGeometry(),
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

      if (auditState.injectFeedbackMesh) {
        const feedbackMesh = new THREEActual.Mesh(
          new THREEActual.BoxGeometry(),
          new THREEActual.MeshBasicMaterial({
            map: (ctx.composer as any).renderTarget1.texture,
          }),
        );
        feedbackMesh.name = 'base-feedback';
        feedbackMesh.layers.set(0);
        ctx.scene.add(feedbackMesh);
      }
    }

    initRitual = vi.fn((seed: string) => {
      this.ritualDNA.seed = seed;
      this.ctx.ritualDNA = { seed };
    });

    setRitualData = vi.fn((data: any) => {
      const nextSeed = String(data?.seed ?? this.ritualDNA.seed ?? '');
      this.ritualDNA.seed = nextSeed;
      this.ctx.ritualDNA = { seed: nextSeed };
    });

    updateState = vi.fn((progress: number) => {
      this.progress = progress;
      this.currentState = {
        ...this.currentState,
        progress,
      };
    });

    update = vi.fn();
  }

  return { RitualOrchestrator };
});

import { Oracle3DScene } from './Oracle3DScene';

describe('Oracle3DScene audit snapshot contract', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    auditState.injectFeedbackMesh = false;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as any).__ORB_AUDIT__;
    delete (window as any).__ORB_AUDIT_READY__;
    delete (window as any).__ORB_ACTIVE_SCENE__;
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

  function auditBridge() {
    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge).toBeDefined();
    expect(bridge.ready()).toBe(true);
    expect(typeof bridge.setVisibleSafeMode).toBe('function');
    return bridge;
  }

  it('produces an extended snapshot without contradiction when no feedback risk is present', () => {
    renderScene();

    const snapshot = auditBridge().snapshot();

    expect(snapshot.renderMode).toBe('composer-bloom');
    expect(snapshot.uiWindow.renderMode).toBe(snapshot.renderMode);
    expect(snapshot.feedbackCandidates).toEqual([]);
    expect(snapshot.uiWindow.feedbackCandidates).toEqual([]);
    expect(snapshot.fluidParticlesConfig.excludeFromComposer).toBe(true);
    expect(snapshot.fluidParticlesConfig.renderLayer).toBe(
      snapshot.uiWindow.layers.overlay,
    );
    expect(snapshot.uiWindow.layers).toEqual({
      composerBase: 0,
      overlay: 1,
    });
    expect(snapshot.sceneStats).toBeDefined();
    expect(snapshot.dom).toBeDefined();
    expect(snapshot.warnings).not.toContain('render-target-feedback-risk');
  });

  it('switches to direct mode and emits a coherent warning set when feedback risk is detected', () => {
    auditState.injectFeedbackMesh = true;
    renderScene();

    const snapshot = auditBridge().snapshot();

    expect(snapshot.renderMode).toBe('direct');
    expect(snapshot.uiWindow.renderMode).toBe('direct');
    expect(snapshot.feedbackCandidates).toHaveLength(1);
    expect(snapshot.uiWindow.feedbackCandidates).toHaveLength(1);
    expect(snapshot.feedbackCandidates[0].objectName).toBe('base-feedback');
    expect(snapshot.warnings).toContain('render-target-feedback-risk');
    expect(snapshot.fluidParticlesConfig.excludeFromComposer).toBe(true);
    expect(snapshot.fluidParticlesConfig.renderLayer).toBe(
      snapshot.uiWindow.layers.overlay,
    );
  });

  it('restores the canonical audit baseline after a manual reset when no feedback source exists', () => {
    renderScene();

    const audit = auditBridge();
    audit.setRenderMode('direct');

    let snapshot = audit.snapshot();
    expect(snapshot.renderMode).toBe('direct');

    audit.resetScene('manual-contract-check');
    snapshot = audit.snapshot();

    expect(snapshot.renderMode).toBe('composer-bloom');
    expect(snapshot.uiWindow.renderMode).toBe('composer-bloom');
    expect(snapshot.feedbackCandidates).toEqual([]);
    expect(snapshot.warnings).not.toContain('render-target-feedback-risk');
    expect(snapshot.fluidParticlesConfig.excludeFromComposer).toBe(true);
    expect(snapshot.fluidParticlesConfig.renderLayer).toBe(
      snapshot.uiWindow.layers.overlay,
    );
  });

  it('can toggle the visible-safe mode through the audit bridge', () => {
    renderScene();

    const audit = auditBridge();
    audit.setVisibleSafeMode(true);
    let snapshot = audit.snapshot();
    expect(snapshot.visibleSafeMode).toBe(true);
    expect(snapshot.uiWindow.visibleSafeMode).toBe(true);

    audit.setVisibleSafeMode(false);
    snapshot = audit.snapshot();
    expect(snapshot.visibleSafeMode).toBe(false);
    expect(snapshot.uiWindow.visibleSafeMode).toBe(false);
  });
});
