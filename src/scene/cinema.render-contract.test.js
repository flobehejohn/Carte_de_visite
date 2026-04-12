import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('gsap', () => ({ default: { to: vi.fn(), set: vi.fn() } }));
vi.mock('./modules/orbTextManager.js', () => ({
  OrbTextManager: vi.fn().mockImplementation(() => ({
    loadFont: vi.fn(),
    spawnOracle: vi.fn(),
    animateReveal: vi.fn(),
    clear: vi.fn(),
    revealProgress: { value: 0 },
  })),
}));

import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('Thème E - Cinématographie, Cheminement et Orbe Élémentaire', () => {
  let ctx, orchestrator;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
      vignettePass: {
        material: { uniforms: { uChromaticAberration: { value: 0 } } },
      },
      runtimeFlags: {},
      lightsRegistry: { get: () => null },
      climateController: {
        setMood: () => {},
        setVisualParams: () => {},
        update: () => {},
        getTargets: () => ({}),
        setProgress: () => {},
        setSeed: () => {},
      },
      volumeConfig: { vignette: 1.0 },
    };
    ctx.scene.add(ctx.orbGroup);
    orchestrator = new RitualOrchestrator(ctx);
  });

  it("Garantit le Cheminement (Journey) : L'Orbe voyage des abysses vers la caméra entre les étapes", () => {
    orchestrator.initRitual('TestUser');
    orchestrator.updateState(0.1);
    const startZ = orchestrator.targetState.orbZOffset;
    orchestrator.updateState(0.95);
    const endZ = orchestrator.targetState.orbZOffset;
    expect(startZ).toBeLessThan(endZ);
  });
});
