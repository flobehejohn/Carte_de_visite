/* @vitest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
    ORB_BASE_RENDER_LAYER,
    ORB_OVERLAY_RENDER_LAYER,
    ensureFluidParticlesConfig,
    resetFluidParticles,
    setFluidParticlesConfig,
    setFluidParticlesEnabled,
} from '../../scene/modules/orbFluidParticles.js';

const FILE = path.resolve(
  process.cwd(),
  'src/components/oracle/Oracle3DScene.tsx',
);

type FeedbackHit = {
  name: string;
  textures: number;
};

function createFluidCtx(): any {
  const scene = new THREE.Scene();
  const orbGroup = new THREE.Group();
  const layersGroup = new THREE.Group();

  scene.add(orbGroup);
  orbGroup.add(layersGroup);

  return {
    scene,
    orbGroup,
    layersGroup,
    fluidParticlesConfig: {},
  };
}

function objectUsesLayer(object: THREE.Object3D, layer: number): boolean {
  return (object.layers.mask & (1 << layer)) !== 0;
}

function asMaterialArray(
  material: THREE.Material | THREE.Material[] | undefined,
): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function collectTextures(material: THREE.Material): THREE.Texture[] {
  const textures: THREE.Texture[] = [];

  // CORRECTION TS2352 : Passage par unknown
  for (const value of Object.values(
    material as unknown as Record<string, unknown>,
  )) {
    if (value instanceof THREE.Texture) {
      textures.push(value);
    }
  }

  return textures;
}

function scanBaseLayerFeedback(
  scene: THREE.Scene,
  renderTargetTextures: Set<THREE.Texture>,
): FeedbackHit[] {
  const hits: FeedbackHit[] = [];

  // Note: traverseVisible remplace traverse pour respecter la logique de rendu
  scene.traverseVisible((obj) => {
    if (obj.userData?.postprocessIsolation === true) return;
    if (!objectUsesLayer(obj, ORB_BASE_RENDER_LAYER)) return;

    const materials = asMaterialArray(
      (obj as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined,
    );

    if (materials.length === 0) return;

    const matchedTextures = materials
      .flatMap((material) => collectTextures(material))
      .filter((texture) => renderTargetTextures.has(texture));

    if (matchedTextures.length === 0) return;

    hits.push({
      name: obj.name || obj.type,
      textures: matchedTextures.length,
    });
  });

  return hits;
}

describe('Oracle3DScene audit integration', () => {
  it('keeps fluid particles isolated from composer on the overlay layer by default', () => {
    const ctx = createFluidCtx();

    const config = ensureFluidParticlesConfig(ctx);
    expect(config.excludeFromComposer).toBe(true);
    expect(config.renderLayer).toBe(ORB_OVERLAY_RENDER_LAYER);

    setFluidParticlesEnabled(ctx, true);
    resetFluidParticles(ctx);

    expect(ctx.fluidParticlesConfig.enabled).toBe(true);
    expect(ctx.fluidParticlesConfig.excludeFromComposer).toBe(true);
    expect(ctx.fluidParticlesConfig.renderLayer).toBe(ORB_OVERLAY_RENDER_LAYER);

    const mesh = ctx.fluidParticlesState?.mesh;
    expect(mesh).toBeTruthy();
    expect(mesh.visible).toBe(true);
    expect(mesh.layers.isEnabled(ORB_OVERLAY_RENDER_LAYER)).toBe(true);
    expect(mesh.layers.isEnabled(ORB_BASE_RENDER_LAYER)).toBe(false);
    expect(mesh.userData.excludeFromComposer).toBe(true);
    expect(mesh.userData.postprocessIsolation).toBe(true);
  });

  it('persists enabled state through config updates and reset path', () => {
    const ctx = createFluidCtx();

    ensureFluidParticlesConfig(ctx);
    setFluidParticlesConfig(ctx, { enabled: true });
    setFluidParticlesEnabled(ctx, false);
    resetFluidParticles(ctx);

    expect(ctx.fluidParticlesConfig.enabled).toBe(false);

    const mesh = ctx.fluidParticlesState?.mesh;
    expect(mesh).toBeTruthy();
    expect(mesh.visible).toBe(false);
    expect(mesh.layers.isEnabled(ORB_OVERLAY_RENDER_LAYER)).toBe(true);
    expect(mesh.userData.excludeFromComposer).toBe(true);
    expect(mesh.userData.postprocessIsolation).toBe(true);
  });

  it('scans feedback candidates only on the base layer and ignores overlay-isolated objects', () => {
    const scene = new THREE.Scene();
    const renderTarget = new THREE.WebGLRenderTarget(16, 16);
    const trackedTextures = new Set<THREE.Texture>([renderTarget.texture]);

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    );
    baseMesh.name = 'base-feedback';
    baseMesh.layers.set(ORB_BASE_RENDER_LAYER);

    const overlayIsolatedMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    );
    overlayIsolatedMesh.name = 'overlay-isolated';
    overlayIsolatedMesh.layers.set(ORB_OVERLAY_RENDER_LAYER);
    overlayIsolatedMesh.userData.postprocessIsolation = true;

    const overlayMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    );
    overlayMesh.name = 'overlay-direct';
    overlayMesh.layers.set(ORB_OVERLAY_RENDER_LAYER);

    scene.add(baseMesh, overlayIsolatedMesh, overlayMesh);

    const hits = scanBaseLayerFeedback(scene, trackedTextures);

    expect(hits).toEqual([{ name: 'base-feedback', textures: 1 }]);

    renderTarget.dispose();
    baseMesh.geometry.dispose();
    overlayIsolatedMesh.geometry.dispose();
    overlayMesh.geometry.dispose();
    (baseMesh.material as THREE.Material).dispose();
    (overlayIsolatedMesh.material as THREE.Material).dispose();
    (overlayMesh.material as THREE.Material).dispose();
  });

  it('keeps a lightweight audit surface in Oracle3DScene without pinning brittle line-by-line implementation details', () => {
    const text = fs.readFileSync(FILE, 'utf8');

    // On vérifie uniquement les invariants de structure primaires de la scène React
    expect(text).toContain('const composer = new EffectComposer(renderer);');
    expect(text).toContain('const animate = (time: number) => {');
    expect(text).toContain('composer.render();');
    expect(text).toContain('(window as any).__ORB_AUDIT__');
    expect(text).toContain('setSeed: (seed: string) => {');
    expect(text).toContain('setProgress: (p: number) => {');
    expect(text).toContain('snapshot,');
  });
});
