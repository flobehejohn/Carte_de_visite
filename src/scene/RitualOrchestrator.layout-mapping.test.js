import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('Thème B - Spatialisation et Layout Pressure (Preuve Sémantique)', () => {
  let ctx;
  let orchestrator;

  beforeEach(() => {
    // Bouchon (Mock) minimal pour isoler l'Orchestrateur sans WebGL
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
      orbShellConfig: { radius: 2.0 },
    };
    ctx.scene.add(ctx.orbGroup);

    orchestrator = new RitualOrchestrator(ctx);
    orchestrator.initRitual('TestUser', { seed: 'layout-seed' });
  });

  it('Simulation Texte Court (textLength = 10) -> Orbe dominant et centré', () => {
    orchestrator.setRitualData({
      textLength: 10,
      textMetrics: { areaRatio: 0.1, linesApprox: 2, viewportW: 1920 },
    });

    // On force la phase de "Reveal" (fin du rituel)
    orchestrator.updateState(0.95);

    // L'échelle reste grande (~0.78)
    expect(orchestrator.targetState.orbScale).toBeGreaterThan(0.75);
    // Le recul de base est ~-1.05. Avec un texte court, on frôle -1.15. (Avant on attendait > -0.8)
    expect(orchestrator.targetState.orbZOffset).toBeGreaterThan(-1.2);
  });

  it("Simulation Texte Long (textLength = 500) -> L'Orbe recule et rétrécit pour libérer la vue", () => {
    orchestrator.setRitualData({
      textLength: 500,
      textMetrics: { areaRatio: 0.8, linesApprox: 30, viewportW: 1920 },
    });
    orchestrator.updateState(0.95);

    // L'échelle doit drastiquement diminuer (~0.52)
    expect(orchestrator.targetState.orbScale).toBeLessThan(0.6);
    // Le recul est puissant (~-2.01). On prouve qu'il recule bien au-delà de -1.5.
    expect(orchestrator.targetState.orbZOffset).toBeLessThan(-1.5);
  });

  it('Simulation Mobile (ViewportW < 900) -> Application du mobileFactor', () => {
    // 1. Scénario Desktop
    orchestrator.setRitualData({
      textLength: 300,
      textMetrics: { areaRatio: 0.5, linesApprox: 15, viewportW: 1920 },
    });
    orchestrator.updateState(0.95);
    const desktopY = orchestrator.targetState.orbYOffset;

    // 2. Scénario Mobile
    orchestrator.setRitualData({
      textLength: 300,
      textMetrics: { areaRatio: 0.5, linesApprox: 15, viewportW: 400 },
    });
    orchestrator.updateState(0.95);
    const mobileY = orchestrator.targetState.orbYOffset;

    // L'orbe doit remonter beaucoup plus haut sur mobile pour fuir le clavier/texte
    expect(mobileY).toBeGreaterThan(desktopY);
  });
});
