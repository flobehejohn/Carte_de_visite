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
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  };
});

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => {
  class EffectComposer {
    readBuffer = null;
    writeBuffer = null;
    renderTarget1 = null;
    renderTarget2 = null;

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
  getOracleTextLength: vi.fn(() => 0),
}));

vi.mock('../../scene/RitualOrchestrator', () => {
  class RitualOrchestrator {
    ctx: any;
    progress = 0;
    currentState = {};
    ritualDNA = { seed: '' };

    constructor(ctx: any) {
      this.ctx = ctx;
    }

    initRitual = orchestratorSpies.initRitual;
    setRitualData = orchestratorSpies.setRitualData;
    updateState = orchestratorSpies.updateState;
    update = orchestratorSpies.update;
  }

  return { RitualOrchestrator };
});

import * as orbFluidParticles from '../../scene/modules/orbFluidParticles.js';
import { Oracle3DScene } from './Oracle3DScene';

describe('Oracle3DScene ritual cycle contract', () => {
  let container: HTMLDivElement;
  let root: Root;
  let rafSpy: ReturnType<typeof vi.fn>;
  let cafSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    rafSpy = vi.fn(() => 1);
    cafSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cafSpy);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderScene(props: {
    formData: any;
    stage: number;
    loading: boolean;
    result: any;
  }) {
    act(() => {
      root.render(<Oracle3DScene {...props} />);
    });
  }

  it('resets only on busy -> idle transition and not while the scene stays busy', () => {
    const resetSpy = vi.spyOn(orbFluidParticles, 'resetFluidParticles');

    renderScene({
      formData: {},
      stage: 1,
      loading: true,
      result: null,
    });

    const initialCalls = resetSpy.mock.calls.length;

    renderScene({
      formData: {},
      stage: 2,
      loading: true,
      result: null,
    });

    expect(resetSpy).toHaveBeenCalledTimes(initialCalls);

    renderScene({
      formData: {},
      stage: 2,
      loading: false,
      result: null,
    });

    expect(resetSpy.mock.calls.length).toBeGreaterThan(initialCalls);
  });

  it('relaunches the ritual explicitly when the seed changes', () => {
    const resetSpy = vi.spyOn(orbFluidParticles, 'resetFluidParticles');

    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    const resetBeforeSeedChange = resetSpy.mock.calls.length;
    const initBeforeSeedChange = orchestratorSpies.initRitual.mock.calls.length;

    renderScene({
      formData: { seed: 'beta' },
      stage: 2,
      loading: false,
      result: { seed: 'beta', visualParams: { seed: 'beta' } },
    });

    expect(resetSpy.mock.calls.length).toBeGreaterThan(resetBeforeSeedChange);
    expect(orchestratorSpies.initRitual.mock.calls.length).toBeGreaterThan(
      initBeforeSeedChange,
    );
    expect(orchestratorSpies.initRitual).toHaveBeenLastCalledWith('beta');
  });

  it('does not relaunch the ritual when the seed stays stable across result refreshes', () => {
    renderScene({
      formData: { seed: 'alpha' },
      stage: 2,
      loading: false,
      result: { seed: 'alpha', visualParams: { seed: 'alpha' } },
    });

    const initAfterFirstStableSeed = orchestratorSpies.initRitual.mock.calls.length;

    renderScene({
      formData: { seed: 'alpha' },
      stage: 3,
      loading: false,
      result: {
        seed: 'alpha',
        visualParams: { seed: 'alpha', variant: 'refresh' },
      },
    });

    expect(orchestratorSpies.initRitual.mock.calls.length).toBe(
      initAfterFirstStableSeed,
    );
  });
});
