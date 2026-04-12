import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { RitualOrchestrator } from './RitualOrchestrator.js';

describe('Thème C - Voile Cinématique et Filtres (Preuve Sémantique)', () => {
  let ctx;
  let orchestrator;

  beforeEach(() => {
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
    orchestrator.initRitual('TestUser');
  });

  it('Garantit que le Voile (Foreground) est un plan optique non-obstructif', () => {
    const veil = orchestrator.foregroundMesh;

    expect(veil).toBeDefined();
    expect(veil.isMesh).toBe(true);
    expect(veil.renderOrder).toBe(10);
    expect(veil.material.depthWrite).toBe(false);
    expect(veil.material.transparent).toBe(true);
    expect(veil.position.z).toBe(4.0);
  });

  it("Garantit l'injection du Shader GLSL pour les effets de Glace/Océan/Fog", () => {
    const veil = orchestrator.foregroundMesh;

    const shaderObj = {
      uniforms: {},
      vertexShader: '',
      fragmentShader: 'vec4 diffuseColor = vec4( diffuse, opacity );',
    };
    veil.material.onBeforeCompile(shaderObj);

    expect(shaderObj.uniforms.uTime).toBeDefined();
    expect(shaderObj.uniforms.uChaos).toBeDefined();
    expect(shaderObj.fragmentShader).toContain('float fbm');
    expect(shaderObj.fragmentShader).toContain('uTime');
  });

  it("Garantit l'interpolation douce (Fade-in/Fade-out) des paramètres du shader sans rupture discrète", () => {
    const veil = orchestrator.foregroundMesh;

    // Initialisation du shader virtuel
    const shaderObj = { uniforms: {}, vertexShader: '', fragmentShader: '' };
    veil.material.onBeforeCompile(shaderObj);
    veil.material.userData.shader = shaderObj;

    // État initial (Calme absolu)
    orchestrator.currentState.veilChaos = 0.0;

    // On simule une nouvelle prédiction LLM provoquant une tempête (Chaos = 1.0)
    orchestrator.targetState.veilChaos = 1.0;

    // On fait avancer le moteur d'une seule frame (16 millisecondes)
    orchestrator.update(0.016);

    const shaderValue = shaderObj.uniforms.uChaos.value;

    // PREUVE : La valeur doit avoir décollé de 0, mais NE DOIT PAS être arrivée à 1.0
    // Elle doit "glisser" doucement.
    expect(shaderValue).toBeGreaterThan(0.0);
    expect(shaderValue).toBeLessThan(1.0);
  });
});
