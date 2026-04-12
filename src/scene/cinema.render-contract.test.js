import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('Thème E - Cinématographie, Cheminement et Orbe Élémentaire', () => {
  let ctx;
  let orchestrator;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(45, 1, 0.1, 100),
      vignettePass: { material: { uniforms: { uChromaticAberration: { value: 0 } } } },
      runtimeFlags: {},
      lightsRegistry: { get: () => null },
      climateController: { setMood: () => {}, setVisualParams: () => {}, update: () => {}, getTargets: () => ({}), setProgress: () => {}, setSeed: () => {} },
      volumeConfig: { vignette: 1.0 }
    };
    ctx.scene.add(ctx.orbGroup);
    orchestrator = new RitualOrchestrator(ctx);
  });

  it('Garantit le Cheminement (Journey) : L\'Orbe voyage des abysses vers la caméra entre les étapes', () => {
    orchestrator.initRitual('TestUser');
    orchestrator.updateState(0.1);
    const startZ = orchestrator.targetState.orbZOffset;
    orchestrator.updateState(0.95);
    const endZ = orchestrator.targetState.orbZOffset;
    expect(startZ).toBeLessThan(-10);
    expect(endZ).toBeGreaterThan(startZ);
  });

  it('Garantit l\'Orbe Élémentaire et le Décor Habité selon l\'ADN', () => {
    orchestrator.setRitualData({ visualParams: { chaos: 1.0 }, seed: 'storm-seed-001' });
    orchestrator.updateState(0.5);
    const genome = ctx.ritualGenome;
    expect(genome.environmental).toBeDefined();
    // On vérifie que la météo inclut bien tous les éléments générés par le moteur
    expect(['rain', 'ash', 'void', 'abyss', 'embers']).toContain(genome.environmental.weather);
    expect(genome.geometry.colors.solidOpacity).toBeLessThan(0.1);
  });

  it('Garantit la Cinématographie (Dolly Zoom, Shake, Aberration)', () => {
    // 1. CORRECTION : On injecte la pression du texte pour déclencher le Dolly Zoom ET le chaos
    orchestrator.setRitualData({ 
        visualParams: { chaos: 0.9 },
        textLength: 800, 
        textMetrics: { areaRatio: 0.9, linesApprox: 40, viewportW: 1920 }
    });
    
    orchestrator.updateState(0.95);
    
    // 2. CORRECTION : On laisse au moteur 60 frames (1 seconde) pour accomplir la transition fluide
    for(let i = 0; i < 60; i++) {
        orchestrator.update(0.016);
    }
    
    // Preuve 1 : Le FOV de la caméra a été altéré dynamiquement (Il a dépassé 45)
    expect(ctx.camera.fov).toBeGreaterThan(45);
    
    // Preuve 2 : Le séisme de la caméra ne dépasse pas la limite anti-nausée (0.05)
    expect(Math.abs(ctx.camera.position.x)).toBeLessThanOrEqual(0.05);
    
    // Preuve 3 : L'aberration optique (Filtre RGB) est activée par la tempête
    expect(orchestrator.targetState.chromaticAberration).toBeGreaterThan(0);
  });
});
