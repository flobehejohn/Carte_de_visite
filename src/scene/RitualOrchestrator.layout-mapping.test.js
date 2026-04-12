import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('Thème B - Spatialisation et Layout Pressure (Preuve Sémantique)', () => {
  let ctx;
  let orchestrator;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
      runtimeFlags: {},
      lightsRegistry: { get: () => null },
      climateController: { setMood: () => {}, setVisualParams: () => {}, update: () => {}, getTargets: () => ({}), setProgress: () => {}, setSeed: () => {} },
    };
    ctx.scene.add(ctx.orbGroup);
    orchestrator = new RitualOrchestrator(ctx);
  });

  it('Simulation Texte Court (textLength = 10) -> Orbe dominant et centré', () => {
    orchestrator.initRitual('TestUser');
    orchestrator.setRitualData({
      textLength: 10,
      textMetrics: { areaRatio: 0.1, linesApprox: 1, viewportW: 1920 }
    });
    
    // CORRECTION : On se place à la toute fin du rituel (Progress = 1.0) pour que le Voyage Cinématique (Thème E) soit achevé.
    orchestrator.updateState(1.0);

    expect(orchestrator.targetState.orbScale).toBeGreaterThan(0.75);
    
    // CORRECTION : Avec l'arrivée du Thème E, le recul Z est plus dramatique.
    // On met à jour la tolérance du contrat pour accepter ce nouveau recul.
    expect(orchestrator.targetState.orbZOffset).toBeGreaterThan(-2.5);
  });

  it('Simulation Texte Long (textLength = 800) -> Orbe se met en retrait', () => {
    orchestrator.initRitual('TestUser');
    orchestrator.setRitualData({
      textLength: 800,
      textMetrics: { areaRatio: 0.8, linesApprox: 30, viewportW: 1920 }
    });
    
    orchestrator.updateState(1.0);

    expect(orchestrator.targetState.orbScale).toBeLessThan(0.75);
    // L'orbe doit être repoussé par la pression spatiale du texte
    expect(orchestrator.targetState.orbZOffset).toBeLessThan(-1.0);
  });
});
