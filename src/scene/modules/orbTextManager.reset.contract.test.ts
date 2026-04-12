// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OrbTextManager } from './orbTextManager';

vi.mock('../../domain/oracleText/InteractionBridge', () => ({
  oracleInteractionBridge: { subscribe: vi.fn() },
}));

vi.mock('troika-three-text', () => ({
  Text: class MockText extends THREE.Mesh {
    constructor() {
      super();
      this.text = '';
      this.dispose = vi.fn();
      this.sync = vi.fn();
    }
  },
}));

describe('OrbTextManager - Contrat de Reset (Sprint 3)', () => {
  it('doit purger tous les textes 3D lors du clear() pour éviter les ghost states', () => {
    const scene = new THREE.Scene();
    const manager = new OrbTextManager(scene);
    manager.spawnOracle({ chapter: 'C', quote: 'T', author: 'Z' });
    expect(manager.meshes.length).toBeGreaterThan(0);
    manager.clear();
    expect(manager.meshes.length).toBe(0);
    expect(manager.worldGroup.children.length).toBe(0);
  });
});
