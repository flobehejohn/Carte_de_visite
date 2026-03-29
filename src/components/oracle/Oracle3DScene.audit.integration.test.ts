/* @vitest-environment node */

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
  for (const value of Object.values(
    material as unknown as Record<string, unknown>,
  )) {
    if (value instanceof THREE.Texture) textures.push(value);
  }
  return textures;
}

function scanBaseLayerFeedback(
  scene: THREE.Scene,
  renderTargetTextures: Set<THREE.Texture>,
): FeedbackHit[] {
  const hits: FeedbackHit[] = [];

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

    hits.push({ name: obj.name || obj.type, textures: matchedTextures.length });
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

    const mesh = ctx.fluidParticlesState?.mesh;
    expect(mesh.layers.isEnabled(ORB_OVERLAY_RENDER_LAYER)).toBe(true);
    expect(mesh.layers.isEnabled(ORB_BASE_RENDER_LAYER)).toBe(false);
  });

  it('persists enabled state through config updates and reset path', () => {
    const ctx = createFluidCtx();
    ensureFluidParticlesConfig(ctx);
    setFluidParticlesConfig(ctx, { enabled: true });
    setFluidParticlesEnabled(ctx, false);
    resetFluidParticles(ctx);
    expect(ctx.fluidParticlesConfig.enabled).toBe(false);
  });

  it('scans feedback candidates only on the base layer and ignores overlay-isolated objects', () => {
    const scene = new THREE.Scene();
    const renderTarget = new THREE.WebGLRenderTarget(16, 16);
    const trackedTextures = new Set<THREE.Texture>([renderTarget.texture]);

    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    );
    baseMesh.name = 'base-feedback';
    baseMesh.layers.set(ORB_BASE_RENDER_LAYER);

    const overlayIsolatedMesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial({ map: renderTarget.texture }),
    );
    overlayIsolatedMesh.name = 'overlay-isolated';
    overlayIsolatedMesh.layers.set(ORB_OVERLAY_RENDER_LAYER);
    overlayIsolatedMesh.userData.postprocessIsolation = true;

    scene.add(baseMesh, overlayIsolatedMesh);

    const hits = scanBaseLayerFeedback(scene, trackedTextures);
    expect(hits).toEqual([{ name: 'base-feedback', textures: 1 }]);
  });
});
