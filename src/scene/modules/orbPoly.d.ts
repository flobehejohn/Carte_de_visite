import * as THREE from 'three';

export type PolyMode = 'torusKnot' | 'polyhedron';

export interface PolyConfig {
  enabled: boolean;
  mode: PolyMode;
  radius: number;
  tube: number;
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
  thickness: number;
  polyDetail: number;
  color: THREE.Color;
  emissive: THREE.Color;
  wireframe: boolean;
  lineWidth: number;
  noiseAmplitude: number;
  noiseFrequency: number;
  dislocation: number;
  subsampling: number;
  flipFaces: boolean;
}

export interface PolyContext {
  ritualGenome?: {
    rng?: {
      random(): number;
    };
  };
  polyConfig?: Partial<PolyConfig>;
  polyMesh?: THREE.Mesh;
  orbGroup?: THREE.Object3D;
  scene?: THREE.Scene;
}

export interface OwnNonIndexedGeometryOptions {
  cloneIfAlreadyNonIndexed?: boolean;
}

/**
 * Attend une géométrie possédée localement.
 * - indexée -> conversion + dispose de l'originale
 * - déjà non indexée -> réutilisation par défaut
 * - clone optionnel si isolation explicite
 */
export function ownNonIndexedGeometry(
  geometry: THREE.BufferGeometry,
  options?: OwnNonIndexedGeometryOptions,
): THREE.BufferGeometry;

export function buildPoly(ctx: PolyContext): THREE.Mesh | null;

export function setPolyConfig(
  ctx: PolyContext,
  patch?: Partial<
    Omit<PolyConfig, 'color' | 'emissive'> & {
      color: THREE.ColorRepresentation;
      emissive: THREE.ColorRepresentation;
    }
  >,
): PolyConfig;

export function updatePolyDeformation(ctx: PolyContext, time?: number): void;
