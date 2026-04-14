import * as THREE from 'three';

/**
 * orbPoly — version gouvernée
 * - Géométrie paramétrique optionnelle (torusKnot / polyhedron)
 * - Subsampling + dislocation seedées (si ctx.ritualGenome.rng)
 * - Déformation vivante, contrôlée
 *
 * Politique importante :
 * - ownNonIndexedGeometry() ne doit être utilisée que sur une géométrie "possédée"
 *   par le module appelant.
 * - Si la géométrie est indexée, on la convertit puis on dispose l'originale.
 * - Si elle est déjà non indexée, on la réutilise par défaut.
 * - Le clone n'est utilisé que si l'appelant le demande explicitement.
 */

const DEFAULT_CONFIG = {
  enabled: false,

  mode: 'torusKnot', // torusKnot | polyhedron
  radius: 0.6,
  tube: 0.2,
  tubularSegments: 140,
  radialSegments: 16,
  p: 2,
  q: 3,

  thickness: 0.5,

  polyDetail: 1,
  color: 0xffffff,
  emissive: 0x000000,

  wireframe: true,
  lineWidth: 1,

  noiseAmplitude: 0.04,
  noiseFrequency: 1.2,
  dislocation: 0.02,

  subsampling: 0.65,
  flipFaces: false,
};

const tempVec = new THREE.Vector3();

const GEOMETRY_KEYS = new Set([
  'enabled',
  'mode',
  'radius',
  'tube',
  'tubularSegments',
  'radialSegments',
  'p',
  'q',
  'polyDetail',
  'subsampling',
  'flipFaces',
]);

function getRng(ctx) {
  return ctx?.ritualGenome?.rng || null;
}

function rnd(ctx) {
  const r = getRng(ctx);
  return r ? r.random() : Math.random();
}

function normalizeColor(value, fallback = 0xffffff) {
  try {
    if (value?.isColor) return value.clone();
    return new THREE.Color(value ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function clamp01(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function ensurePolyConfig(ctx) {
  if (!ctx.polyConfig) {
    ctx.polyConfig = {
      ...DEFAULT_CONFIG,
      color: new THREE.Color(DEFAULT_CONFIG.color),
      emissive: new THREE.Color(DEFAULT_CONFIG.emissive),
    };
  } else {
    ctx.polyConfig = { ...DEFAULT_CONFIG, ...ctx.polyConfig };
    ctx.polyConfig.mode = ['torusKnot', 'polyhedron'].includes(
      ctx.polyConfig.mode,
    )
      ? ctx.polyConfig.mode
      : 'torusKnot';
    ctx.polyConfig.color = normalizeColor(
      ctx.polyConfig.color,
      DEFAULT_CONFIG.color,
    );
    ctx.polyConfig.emissive = normalizeColor(
      ctx.polyConfig.emissive,
      DEFAULT_CONFIG.emissive,
    );
    ctx.polyConfig.subsampling = clamp01(ctx.polyConfig.subsampling ?? 1);
    ctx.polyConfig.lineWidth = ctx.polyConfig.lineWidth ?? 1;
  }

  return ctx.polyConfig;
}

function disposePolyMesh(ctx) {
  if (!ctx.polyMesh) return;

  ctx.polyMesh.parent?.remove(ctx.polyMesh);
  ctx.polyMesh.geometry?.dispose?.();
  ctx.polyMesh.material?.dispose?.();
  ctx.polyMesh = null;
}

function buildBaseGeometry(cfg) {
  if (cfg.mode === 'polyhedron') {
    return new THREE.IcosahedronGeometry(
      cfg.radius,
      Math.max(0, Math.floor(cfg.polyDetail || 1)),
    );
  }

  return new THREE.TorusKnotGeometry(
    cfg.radius,
    cfg.tube,
    Math.max(3, Math.floor(cfg.tubularSegments || 140)),
    Math.max(3, Math.floor(cfg.radialSegments || 16)),
    Math.max(1, Math.floor(cfg.p || 2)),
    Math.max(1, Math.floor(cfg.q || 3)),
  );
}

/**
 * Garantit une géométrie non indexée en clarifiant la possession mémoire.
 *
 * Contrat :
 * - si la géométrie est indexée : conversion en non-indexé + dispose de l'originale
 * - si elle est déjà non indexée : réutilisation par défaut
 * - si l'appelant veut une isolation stricte : clone explicite
 *
 * IMPORTANT :
 * Cette fonction attend une géométrie possédée localement par le module appelant.
 */
export function ownNonIndexedGeometry(
  geometry,
  { cloneIfAlreadyNonIndexed = false } = {},
) {
  if (!geometry?.isBufferGeometry) {
    throw new TypeError(
      '[orbPoly] ownNonIndexedGeometry attend une THREE.BufferGeometry',
    );
  }

  if (geometry.index) {
    const converted = geometry.toNonIndexed();
    geometry.dispose?.();
    return converted;
  }

  return cloneIfAlreadyNonIndexed ? geometry.clone() : geometry;
}

function applySubsampling(ctx, geometry, ratio) {
  const amount = clamp01(ratio);
  const source = ownNonIndexedGeometry(geometry);

  if (amount >= 0.999) return source;

  const pos = source.getAttribute('position');
  if (!pos) return source;

  const triCount = Math.floor(pos.count / 3);
  const selected = [];

  for (let tri = 0; tri < triCount; tri++) {
    if (rnd(ctx) <= amount) {
      for (let v = 0; v < 3; v++) {
        const idx = tri * 3 + v;
        selected.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      }
    }
  }

  if (!selected.length) return source;

  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(selected, 3),
  );

  // La géométrie intermédiaire n'est plus utile après subsampling.
  source.dispose?.();

  return result;
}

function prepareGeometry(ctx, cfg) {
  let geometry = buildBaseGeometry(cfg);
  geometry = applySubsampling(ctx, geometry, cfg.subsampling ?? 1);

  if (cfg.flipFaces) geometry.scale(-1, 1, 1);

  geometry.computeVertexNormals();

  const position = geometry.getAttribute('position');
  geometry.userData.basePositions = position.array.slice();

  const seeds = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    seeds[i] = rnd(ctx) * 2 - 1;
  }
  geometry.userData.dislocationSeeds = seeds;

  return geometry;
}

function buildMaterial(cfg) {
  const material = new THREE.MeshPhysicalMaterial({
    color: cfg.color.clone(),
    emissive: cfg.emissive.clone(),

    transmission: cfg.mode === 'torusKnot' ? 0.9 : 0.0,
    thickness: cfg.thickness ?? 0.5,

    metalness: 0.15,
    roughness: 0.28,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,

    side: THREE.DoubleSide,
    wireframe: !!cfg.wireframe,
  });

  material.wireframeLinewidth = cfg.lineWidth ?? 1;
  return material;
}

function applyMaterialFromConfig(ctx) {
  if (!ctx.polyMesh) return;

  const cfg = ensurePolyConfig(ctx);
  const mat = ctx.polyMesh.material;

  mat.color.copy(cfg.color);
  mat.emissive.copy(cfg.emissive);
  mat.wireframe = !!cfg.wireframe;
  mat.wireframeLinewidth = cfg.lineWidth ?? 1;
  mat.thickness = cfg.thickness ?? 0.5;
  mat.transmission = cfg.mode === 'torusKnot' ? 0.9 : 0.0;
  mat.needsUpdate = true;
}

export function buildPoly(ctx) {
  const cfg = ensurePolyConfig(ctx);
  disposePolyMesh(ctx);

  if (!cfg.enabled) return null;

  const geometry = prepareGeometry(ctx, cfg);
  const material = buildMaterial(cfg);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'ParametricPoly';

  (ctx.orbGroup || ctx.scene).add(mesh);
  ctx.polyMesh = mesh;

  return mesh;
}

export function setPolyConfig(ctx, patch = {}) {
  const cfg = ensurePolyConfig(ctx);
  let needsRebuild = false;

  Object.entries(patch).forEach(([key, value]) => {
    if (key === 'color') {
      cfg.color = normalizeColor(value, cfg.color);
      return;
    }
    if (key === 'emissive') {
      cfg.emissive = normalizeColor(value, cfg.emissive);
      return;
    }
    if (key === 'wireframe') {
      cfg.wireframe = !!value;
      return;
    }
    if (key === 'lineWidth') {
      cfg.lineWidth = Math.max(0.1, Number(value) || 1);
      return;
    }
    if (key === 'thickness') {
      cfg.thickness = Math.max(0, Number(value) || 0.5);
      return;
    }

    if (
      key === 'noiseAmplitude' ||
      key === 'noiseFrequency' ||
      key === 'dislocation'
    ) {
      cfg[key] = Number(value);
      return;
    }

    if (key === 'subsampling') {
      cfg.subsampling = clamp01(value);
      needsRebuild = true;
      return;
    }

    if (GEOMETRY_KEYS.has(key)) {
      if (key === 'enabled') cfg.enabled = !!value;
      else if (key === 'mode') {
        cfg.mode = ['torusKnot', 'polyhedron'].includes(value)
          ? value
          : cfg.mode;
      } else if (key === 'flipFaces') {
        cfg.flipFaces = !!value;
      } else {
        cfg[key] = Number(value);
      }

      needsRebuild = true;
      return;
    }

    cfg[key] = value;
  });

  if (needsRebuild) buildPoly(ctx);
  else applyMaterialFromConfig(ctx);

  if (!cfg.enabled) disposePolyMesh(ctx);

  return cfg;
}

export function updatePolyDeformation(ctx, time = 0) {
  const cfg = ensurePolyConfig(ctx);
  if (!cfg.enabled || !ctx.polyMesh) return;

  const amplitude = Number(cfg.noiseAmplitude ?? 0);
  const dislocation = Number(cfg.dislocation ?? 0);
  if (!amplitude && !dislocation) return;

  const geometry = ctx.polyMesh.geometry;
  const position = geometry.getAttribute('position');
  const base = geometry.userData?.basePositions;
  const seeds = geometry.userData?.dislocationSeeds;
  if (!position || !base) return;

  const freq = Number(cfg.noiseFrequency ?? 1);

  for (let i = 0; i < position.count; i++) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    const bz = base[i * 3 + 2];

    tempVec.set(bx, by, bz);
    const len = tempVec.length() || 1;
    tempVec.divideScalar(len);

    const noise =
      Math.sin(bx * freq + time * 0.8) +
      Math.cos(bz * freq * 1.2 + time * 0.6) +
      Math.sin(by * freq * 0.7);

    const offset = (noise * amplitude) / 3 + dislocation * (seeds?.[i] || 0);

    position.setXYZ(
      i,
      bx + tempVec.x * offset,
      by + tempVec.y * offset,
      bz + tempVec.z * offset,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
}
