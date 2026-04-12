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

const { applyMaterialsMock } = vi.hoisted(() => ({
  applyMaterialsMock: vi.fn(),
}));

vi.mock('./render/materials/applyMaterials', () => ({
  applyMaterials: applyMaterialsMock,
}));

import { RitualOrchestrator } from './RitualOrchestrator.js';

function createCtx() {
  return {
    scene: new THREE.Scene(),
    orbGroup: new THREE.Group(),
    camera: new THREE.PerspectiveCamera(),
    climateController: {
      setMood: () => {},
      setVisualParams: () => {},
      update: () => {},
      getTargets: () => ({}),
      setProgress: () => {},
      setSeed: () => {},
    },
    lightSafetyGovernor: { update: () => ({ active: false }) },
  };
}

describe('RitualOrchestrator materials runtime flags guard', () => {
  beforeEach(() => {
    applyMaterialsMock.mockClear();
  });

  it('n explose pas si runtimeFlags est absent', () => {
    const ctx = createCtx();
    const orch = new RitualOrchestrator(ctx);
    expect(() => orch.update(1)).not.toThrow();
  });
});
