import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge';
import { OrbTextManager } from './orbTextManager';

vi.mock('troika-three-text', () => {
  return {
    Text: class {
      constructor() {
        this.layers = new THREE.Layers();
        this.position = new THREE.Vector3();
        this.sync = vi.fn();
        this.dispose = vi.fn();
        this.fillOpacity = 0;
        this.outlineOpacity = 0;
      }
    },
  };
});

describe('Phase 3 & 4 - Moteur Typographique 3D SDF et Pont Synaptique', () => {
  let scene;
  let textManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    textManager = new OrbTextManager(scene);
  });

  afterEach(() => {
    textManager.dispose();
  });

  it("E1: Initialise l'architecture de ségrégation spatiale (HUD vs World)", () => {
    expect(textManager.worldGroup).toBeDefined();
    expect(textManager.hudGroup).toBeDefined();
    expect(scene.children.includes(textManager.worldGroup)).toBe(true);
  });

  it('E2: spawnOracle instancie des jumeaux optiques (Bloom Layer 0 + Overlay Layer 1)', () => {
    textManager.spawnOracle({
      chapter: 'CHAPITRE I',
      quote: 'La lumière fut.',
    });
    expect(textManager.meshes.length).toBe(4);
  });

  it("E4: Le pont synaptique modifie les opacités cibles lors d'un événement (Phase 4)", () => {
    textManager.spawnOracle({ chapter: 'TEST', quote: 'TEST' });

    const firstMesh = textManager.meshes[0];
    const initialTargetOpacity = firstMesh.userData.targetFillOpacity;

    // Simulation d'un événement hover venant de React (HTML)
    oracleInteractionBridge.setFocus({ target: 'citation', source: 'html' });

    // Le mesh WebGL doit avoir réduit son opacité cible pour s'effacer
    expect(firstMesh.userData.targetFillOpacity).toBeLessThan(
      initialTargetOpacity,
    );

    // Simulation de la fin du survol
    oracleInteractionBridge.clearFocus('html');
    expect(firstMesh.userData.targetFillOpacity).toBe(initialTargetOpacity);
  });
});
