/* @vitest-environment node */

import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownNonIndexedGeometry } from './orbPoly.js';

function createNonIndexedTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
  );
  return geometry;
}

describe('orbPoly geometry normalization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('réutilise une géométrie déjà non indexée sans rappeler toNonIndexed()', () => {
    const geometry = createNonIndexedTriangle();
    const toNonIndexedSpy = vi.spyOn(geometry, 'toNonIndexed');
    const disposeSpy = vi.spyOn(geometry, 'dispose');

    const result = ownNonIndexedGeometry(geometry);

    expect(result).toBe(geometry);
    expect(result.index).toBeNull();
    expect(toNonIndexedSpy).not.toHaveBeenCalled();
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('convertit une géométrie indexée une seule fois puis dispose l’originale possédée', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    expect(geometry.index).not.toBeNull();

    const toNonIndexedSpy = vi.spyOn(geometry, 'toNonIndexed');
    const disposeSpy = vi.spyOn(geometry, 'dispose');

    const result = ownNonIndexedGeometry(geometry);

    expect(result).not.toBe(geometry);
    expect(result.index).toBeNull();
    expect(toNonIndexedSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it('permet une isolation explicite par clone pour une géométrie déjà non indexée', () => {
    const geometry = createNonIndexedTriangle();
    const toNonIndexedSpy = vi.spyOn(geometry, 'toNonIndexed');
    const cloneSpy = vi.spyOn(geometry, 'clone');
    const disposeSpy = vi.spyOn(geometry, 'dispose');

    const result = ownNonIndexedGeometry(geometry, {
      cloneIfAlreadyNonIndexed: true,
    });

    expect(result).not.toBe(geometry);
    expect(result.index).toBeNull();
    expect(toNonIndexedSpy).not.toHaveBeenCalled();
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    expect(disposeSpy).not.toHaveBeenCalled();
  });
});
