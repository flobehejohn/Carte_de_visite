import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';

import { createInnerParticles } from './modules/orbParticles.js';
import { buildVolume } from './modules/orbVolumes.js';

interface MockConfig {
  enabled: boolean;
  count?: number;
  opacity?: number;
  mode?: string;
  color1?: THREE.Color;
  color2?: THREE.Color;
  dynamics?: { burst: boolean; lfoSpeed: number; maxNeighbors: number };
}

interface MockContext {
  scene: THREE.Scene;
  orbGroup: THREE.Group;
  runtimeFlags: Record<string, boolean>;
  lightsRegistry: {
    get: (name: string) => any;
  };
  particlesConfig?: MockConfig;
  particlesPoints?: THREE.Points;
  particlesLinks?: THREE.LineSegments;
  particlesTrails?: THREE.Points;
  volumeState?: {
    backgroundMesh: THREE.Mesh;
    glowMesh: THREE.Mesh;
    backgroundMaterial: THREE.Material;
    glowMaterial: THREE.Material;
  };
}

describe('Contrat de Rendu Optique (Niveau 2 - Preuve Sémantique)', () => {
  let ctx: MockContext;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      orbGroup: new THREE.Group(),
      runtimeFlags: {},
      lightsRegistry: {
        get: () => null,
      },
    };
    ctx.scene.add(ctx.orbGroup);
  });

  describe('Module: orbVolumes.js', () => {
    it('Les matériaux de volume ne doivent pas écrire dans le Z-Buffer (depthWrite === false)', () => {
      const state = buildVolume(ctx);

      expect(state.backgroundMesh).toBeDefined();
      expect((state.backgroundMaterial as THREE.Material).depthWrite).toBe(
        false,
      );
      expect(state.glowMesh).toBeDefined();
      expect((state.glowMaterial as THREE.Material).depthWrite).toBe(false);
    });

    it('Le glowMaterial doit être transparent et utiliser AdditiveBlending', () => {
      const state = buildVolume(ctx);
      expect((state.glowMaterial as THREE.Material).transparent).toBe(true);
      expect((state.glowMaterial as THREE.Material).blending).toBe(
        THREE.AdditiveBlending,
      );
    });
  });

  describe('Module: orbParticles.js', () => {
    it('Tous les matériaux de particules doivent être transparents et sans occlusion', () => {
      ctx.particlesConfig = {
        enabled: true,
        count: 10,
        opacity: 1.0,
        mode: 'trails',
        color1: new THREE.Color(0xffffff),
        color2: new THREE.Color(0xffffff),
        dynamics: { burst: false, lfoSpeed: 0.1, maxNeighbors: 10 },
      };

      createInnerParticles(ctx);

      const ptMat = ctx.particlesPoints?.material as THREE.Material;
      const lkMat = ctx.particlesLinks?.material as THREE.Material;
      const trMat = ctx.particlesTrails?.material as THREE.Material;

      expect(ptMat).toBeDefined();
      expect(ptMat.depthWrite).toBe(false);
      expect(ptMat.blending).toBe(THREE.AdditiveBlending);
      expect(lkMat?.depthWrite).toBe(false);
      expect(trMat?.depthWrite).toBe(false);
    });
  });
});
