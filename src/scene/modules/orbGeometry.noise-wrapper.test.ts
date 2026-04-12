import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import propre et natif (le fichier .d.ts voisin gère désormais le typage)
import {
    createPolyhedron,
    deformPolyhedron,
    setDeformAmplitude,
    setRitualConfig,
} from './orbGeometry.js';

describe('orbGeometry — Moteur Procédural & Noise Wrapper (Phase 2B)', () => {
  let ctx: any;
  let originalNoise4d: any;
  let originalNoise4D: any;
  let originalNoise4: any;

  const createSeededRNG = (seed: number) => {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  };

  beforeEach(() => {
    originalNoise4d = SimplexNoise.prototype.noise4d;
    originalNoise4D = (SimplexNoise.prototype as any).noise4D;
    originalNoise4 = (SimplexNoise.prototype as any).noise4;

    ctx = {
      scene: new THREE.Scene(),
      layersGroup: new THREE.Group(),
      orbGroup: new THREE.Group(),
      wireFrames: [],
      orbShellConfig: {
        radius: 2.0,
        detail: 2,
        shapeType: 'icosa',
      },
      ritualGenome: {
        rng: {
          random: createSeededRNG(12345),
        },
      },
    };

    ctx.scene.add(ctx.orbGroup);
    ctx.orbGroup.add(ctx.layersGroup);
  });

  afterEach(() => {
    SimplexNoise.prototype.noise4d = originalNoise4d;
    (SimplexNoise.prototype as any).noise4D = originalNoise4D;
    (SimplexNoise.prototype as any).noise4 = originalNoise4;
    vi.restoreAllMocks();
  });

  const getVertexChecksum = (mesh: THREE.Mesh) => {
    const pos = mesh.geometry.attributes.position;
    let sum = 0;
    for (let i = 0; i < pos.count * 3; i++) {
      sum += Math.abs(pos.array[i]) * (i + 1);
    }
    return Math.round(sum * 1000) / 1000;
  };

  const getVertexMaxDistance = (mesh: THREE.Mesh) => {
    const pos = mesh.geometry.attributes.position;
    let maxDistSq = 0;
    const temp = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      temp.fromBufferAttribute(pos, i);
      const distSq = temp.lengthSq();
      if (distSq > maxDistSq) maxDistSq = distSq;
    }
    return Math.sqrt(maxDistSq);
  };

  it("Garde-fou : Clamp les amplitudes extrêmes pour éviter l'explosion topologique", () => {
    createPolyhedron(ctx);
    const mesh = ctx.orbMesh as THREE.Mesh;
    const baseRadius = ctx.orbShellConfig.radius;

    setDeformAmplitude(ctx, { base: 9999, pulse: 9999, dislocation: 9999 });
    deformPolyhedron(ctx, 1.0);

    const maxDist = getVertexMaxDistance(mesh);

    expect(maxDist).toBeLessThanOrEqual(15.0);
    expect(maxDist).toBeGreaterThan(baseRadius);
    expect(mesh.frustumCulled).toBe(false);
  });

  it("Wrapper : Résiste à l'absence totale des méthodes de bruit Simplex natives (Fallback trigonométrique)", () => {
    createPolyhedron(ctx);
    const mesh = ctx.orbMesh as THREE.Mesh;
    const initialChecksum = getVertexChecksum(mesh);

    delete (SimplexNoise.prototype as any).noise4d;
    delete (SimplexNoise.prototype as any).noise4D;
    delete (SimplexNoise.prototype as any).noise4;

    setDeformAmplitude(ctx, { base: 1.0, pulse: 0, dislocation: 0 });

    expect(() => deformPolyhedron(ctx, 1.0)).not.toThrow();

    const newChecksum = getVertexChecksum(mesh);
    expect(newChecksum).not.toEqual(initialChecksum);
  });

  it('Unicité Déterministe : Deux seeds différentes produisent une topologie distincte', () => {
    ctx.ritualGenome.rng.random = createSeededRNG(42);
    createPolyhedron(ctx);
    setDeformAmplitude(ctx, { base: 0, pulse: 0, dislocation: 1.0 });
    deformPolyhedron(ctx, 0);
    const checksumA = getVertexChecksum(ctx.orbMesh);

    ctx.ritualGenome.rng.random = createSeededRNG(999);
    createPolyhedron(ctx);
    setDeformAmplitude(ctx, { base: 0, pulse: 0, dislocation: 1.0 });
    deformPolyhedron(ctx, 0);
    const checksumB = getVertexChecksum(ctx.orbMesh);

    expect(checksumA).not.toBe(0);
    expect(checksumB).not.toBe(0);
    expect(checksumA).not.toEqual(checksumB);

    ctx.ritualGenome.rng.random = createSeededRNG(42);
    createPolyhedron(ctx);
    setDeformAmplitude(ctx, { base: 0, pulse: 0, dislocation: 1.0 });
    deformPolyhedron(ctx, 0);
    const checksumARevisited = getVertexChecksum(ctx.orbMesh);

    expect(checksumARevisited).toEqual(checksumA);
  });

  it('Sensibilité au LLM : Une variation infime de la fréquence génère une altération subtile mais mesurable', () => {
    createPolyhedron(ctx);
    setDeformAmplitude(ctx, { base: 1.0, pulse: 0, dislocation: 0 });

    setRitualConfig(ctx, {
      geometry: { noise: { f1: 1.0, f2: 1.0, f3: 1.0 } },
    });
    deformPolyhedron(ctx, 10.0);
    const checksumBase = getVertexChecksum(ctx.orbMesh);

    setRitualConfig(ctx, {
      geometry: { noise: { f1: 1.05, f2: 1.0, f3: 1.0 } },
    });
    deformPolyhedron(ctx, 10.0);
    const checksumShifted = getVertexChecksum(ctx.orbMesh);

    const delta = Math.abs(checksumBase - checksumShifted);

    expect(delta).toBeGreaterThan(0.01);
    expect(delta).toBeLessThan(30000.0);
  });
});

