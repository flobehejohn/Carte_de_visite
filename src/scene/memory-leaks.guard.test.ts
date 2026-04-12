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
import * as orbFluidParticles from './modules/orbFluidParticles.js';

describe('Thème D - Stabilité 60 FPS, Fuites Mémoires et Variabilité Vectorielle', () => {
  let ctx: any,
    orchestrator: RitualOrchestrator,
    geoDisposeSpy: any,
    matDisposeSpy: any;

  beforeEach(() => {
    geoDisposeSpy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    matDisposeSpy = vi.spyOn(THREE.Material.prototype, 'dispose');
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
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
    };
    orchestrator = new RitualOrchestrator(ctx);
  });

  it("Garantit que la régénération cyclique de l'Océan Fluide libère le GPU", () => {
    orchestrator.initRitual('TestUser');
    for (let i = 0; i < 15; i++) {
      orbFluidParticles.setFluidParticlesConfig(ctx as any, {
        enabled: true,
        maxCount: 500 + i * 10,
        flowMode: 'vortex',
      });
    }
    expect(geoDisposeSpy).toHaveBeenCalled();
  });
});
