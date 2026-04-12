/* @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Oracle3DScene } from './Oracle3DScene';

// Mocks nécessaires pour JSDOM
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    domElement = document.createElement('canvas');
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0;
    toneMappingExposure = 1;
    localClippingEnabled = false;
    autoClear = true;
    info = { render: {} };
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    setRenderTarget = vi.fn();
    render = vi.fn();
    clearDepth = vi.fn();
    dispose = vi.fn();
    setClearColor = vi.fn();
    clear = vi.fn();
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});

vi.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    readBuffer = null;
    writeBuffer = null;
    renderTarget1 = null;
    renderTarget2 = null;
    constructor() {}
    addPass = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    setSize = vi.fn();
  },
}));

vi.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({
  RenderPass: class {},
}));
vi.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({
  UnrealBloomPass: class {
    enabled = true;
    setSize = vi.fn();
  },
}));

vi.mock('../../scene/RitualOrchestrator', () => {
  class RitualOrchestrator {
    ctx: any;
    progress = 0;
    currentState = {};
    ritualDNA = { seed: '' };

    constructor(ctx: any) {
      this.ctx = ctx;
      // Simulation d'une géométrie conforme à la Phase 1 attachée au contexte
      const mesh = new THREE.Mesh();
      mesh.name = 'OrbMesh';
      mesh.frustumCulled = false;
      mesh.layers.set(0);
      mesh.userData.renderAuditCategory = 'orb-solid';
      ctx.orbMesh = mesh;

      const wire = new THREE.LineSegments();
      wire.name = 'ExoWireframe-0';
      // Simule un wireframe initialement invisible pour éprouver le forçage d'urgence
      wire.visible = false;
      ctx.wireFrames = [wire];
    }

    initRitual = vi.fn();
    setRitualData = vi.fn();
    updateState = vi.fn();
    update = vi.fn(() => {
      // Simule un orchestrateur malveillant ou aveugle qui masque la géométrie à chaque frame
      if (this.ctx.wireFrames) {
        this.ctx.wireFrames.forEach((w: any) => (w.visible = false));
      }
    });
  }
  return { RitualOrchestrator };
});

describe('Oracle3DScene — Mode Urgence (Phase 3)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    // Remplacement strict de rAF pour contrôler la boucle d'animation
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(16), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("Garantit que le mode Urgence révèle le shell principal de l'Orbe dans l'audit", () => {
    act(() => {
      root.render(
        <Oracle3DScene
          formData={{ seed: 'test' }}
          stage={1}
          loading={false}
          result={null}
        />,
      );
    });

    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge).toBeDefined();

    act(() => {
      bridge.setEmergencyVisibleMode(true);
      // Avance le temps pour forcer l'exécution de la boucle `animate()` et l'override de visibilité
      vi.advanceTimersByTime(32);
    });

    const snap = bridge.snapshot();

    // 1. Preuves structurelles d'urgence
    expect(snap.emergencyVisibleMode).toBe(true);
    expect(snap.renderMode).toBe('direct');

    // 2. Preuves géométriques (Garantie de visibilité du Shell)
    expect(snap.orbShell).toBeDefined();
    expect(snap.orbShell.present).toBe(true);
    expect(snap.orbShell.auditCategory).toBe('orb-solid');
    expect(snap.orbShell.frustumCulled).toBe(false);
    expect(snap.orbShell.visible).toBe(true);

    // 3. Preuve du forçage de l'Emergency Mode (les wireframes sont devenus visibles)
    expect(snap.orbShell.wireframeCount).toBeGreaterThan(0);
    expect(snap.orbShell.visibleWireframeCount).toBe(
      snap.orbShell.wireframeCount,
    );

    // 4. Preuve de la complétude du snapshot d'audit
    expect(snap.warnings).not.toContain('orb-shell-missing-audit-category');
    expect(snap.warnings).not.toContain('emergency-mode-no-visible-wireframes');
  });
});
