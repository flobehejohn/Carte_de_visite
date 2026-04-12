import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPolyhedron } from './orbGeometry.js';

describe('orbGeometry — Contrat de Rendu (Phase 2)', () => {
  let ctx: any;

  beforeEach(() => {
    ctx = {
      scene: new THREE.Scene(),
      layersGroup: new THREE.Group(),
      orbGroup: new THREE.Group(),
      wireFrames: [],
      orbShellConfig: {
        radius: 1.8,
        detail: 1,
        shapeType: 'icosa',
        wireLayers: 3,
        wireSpacing: 0.06,
      },
      ritualGenome: {
        rng: {
          random: () => 0.5,
          float: (min: number, max: number) => min + (max - min) * 0.5,
        },
      },
    };

    ctx.scene.add(ctx.orbGroup);
    ctx.orbGroup.add(ctx.layersGroup);
  });

  it("respecte les contrats de visibilité et d'audit pour le mesh solide", () => {
    createPolyhedron(ctx);

    const mesh = ctx.orbMesh;

    expect(mesh).toBeDefined();
    expect(mesh.name).toBe('OrbMesh');
    expect(mesh.isMesh).toBe(true);
    expect(mesh.layers.mask).toBe(1);
    expect(mesh.renderOrder).toBe(0);
    expect(mesh.frustumCulled).toBe(false);

    expect(mesh.userData.renderAuditCategory).toBe('orb-solid');
    expect(mesh.userData.postprocessIsolation).toBe(false);

    expect(mesh.material).toBeDefined();
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(
      0x8a9ba8,
    );
  });

  it("respecte les contrats de visibilité et d'audit pour les wireframes exo-atmosphériques", () => {
    createPolyhedron(ctx);

    const wireframes = ctx.wireFrames;

    expect(wireframes.length).toBe(3);

    wireframes.forEach((wire: THREE.Object3D, index: number) => {
      expect(wire.name).toBe(`ExoWireframe-${index}`);
      expect(wire.layers.mask).toBe(1);
      expect(wire.renderOrder).toBe(1 + index);
      expect(wire.frustumCulled).toBe(false);

      expect(wire.userData.renderAuditCategory).toBe('orb-wire');
      expect(wire.userData.postprocessIsolation).toBe(false);
    });
  });
});
