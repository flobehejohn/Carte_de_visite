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

describe('Thème B - Spatialisation et Layout Pressure (Preuve Sémantique)', () => {
  let ctx, orchestrator;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
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
    ctx.scene.add(ctx.orbGroup);
    orchestrator = new RitualOrchestrator(ctx);
  });

  it('Simulation Texte Court (textLength = 10) -> Orbe dominant et centré', () => {
    orchestrator.initRitual('TestUser');
    orchestrator.setRitualData({
      textLength: 10,
      textMetrics: { areaRatio: 0.1, linesApprox: 1, viewportW: 1920 },
    });
    orchestrator.updateState(1.0);
    expect(orchestrator.targetState.orbScale).toBeGreaterThan(0.75);
    expect(orchestrator.targetState.orbZOffset).toBeGreaterThan(-2.5);
  });
});
