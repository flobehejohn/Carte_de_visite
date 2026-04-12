// @vitest-environment node
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// 1. On neutralise GSAP (animations)
vi.mock('gsap', () => ({ default: { to: vi.fn(), set: vi.fn() } }));

// 2. On neutralise le texte 3D
vi.mock('./modules/orbTextManager.js', () => ({
  OrbTextManager: vi.fn().mockImplementation(() => ({
    loadFont: vi.fn(),
    spawnOracle: vi.fn(),
    animateReveal: vi.fn(),
    clear: vi.fn(),
    revealProgress: { value: 0 },
  })),
}));

// 3. On neutralise l'Audit Bridge pour l'empêcher de scanner une scène incomplète
vi.mock('./audit/OrbAuditBridge.ts', () => ({
  OrbAuditBridge: vi.fn().mockImplementation(() => ({
    hookIntoRenderer: vi.fn(),
    captureRuntimeState: vi.fn(),
  })),
}));

import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('RitualOrchestrator - Order Lock', () => {
  it('Vérifie que update est appelé sans erreur', () => {
    // Utilisation d'une VRAIE hiérarchie Three.js complète
    // pour éviter toute erreur de propriété manquante (.x, .add, .copy, etc.)
    const ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
      climateController: {
        setMood: () => {},
        setVisualParams: () => {},
        update: () => {},
        getTargets: () => ({}),
        setProgress: () => {},
        setSeed: () => {},
      },
      lightSafetyGovernor: {
        update: () => ({ active: false, safetyFactor: 1.0, bloomClamp: null }),
      },
      runtimeFlags: {},
    };

    // On assemble la scène
    ctx.scene.add(ctx.orbGroup);

    const orch = new RitualOrchestrator(ctx);

    // Teste la fonction update() : elle doit s'exécuter de bout en bout sans crasher
    expect(() => orch.update(16)).not.toThrow();
  });
});
