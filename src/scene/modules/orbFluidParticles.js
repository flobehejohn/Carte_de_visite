import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * orbFluidParticles — version stabilisée, overlay-safe et conforme à l'audit
 * Règles :
 * - InstancedMesh conservé
 * - isolation overlay conservée
 * - matériau additif conservé
 * - aucune écriture post-construction sur :
 *   material.opacity / transparent / depthWrite / depthTest
 * - si la config optique change, le matériau est recréé
 * - compatibilité legacy ajoutée via initFluidParticles + ctx.fluidParticles
 */

const simplex = new SimplexNoise();

export const ORB_BASE_RENDER_LAYER = 0;
export const ORB_OVERLAY_RENDER_LAYER = 1;

let simplexModeLogged = false;
let fallbackHits = 0;

function resolveNoiseFn(methods) {
  for (const m of methods) {
    if (typeof simplex[m] === 'function') return simplex[m].bind(simplex);
  }
  return null;
}

const noiseFn2 = resolveNoiseFn(['noise2D', 'noise2d', 'noise']);
const noiseFn3 = resolveNoiseFn(['noise3D', 'noise3d', 'noise3']);
const noiseFn4 = resolveNoiseFn(['noise4D', 'noise4d', 'noise4']);

function logSimplexMode() {
  if (simplexModeLogged) return;
  simplexModeLogged = true;

  const mode2 = noiseFn2 ? noiseFn2.name || 'custom2' : 'fallback';
  const mode3 = noiseFn3 ? noiseFn3.name || 'custom3' : 'fallback';
  const mode4 = noiseFn4 ? noiseFn4.name || 'custom4' : 'fallback';

  console.info(
    `[FluidParticles] simplex wrapper mode: 2->${mode2}, 3->${mode3}, 4->${mode4}`,
  );
}

function noise2(x, y) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn2) return noiseFn2(x, y);
  fallbackHits += 1;
  return Math.sin(x * 0.73 + y * 0.37);
}

function noise3(x, y, z) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn3) return noiseFn3(x, y, z);
  fallbackHits += 1;
  return Math.sin(x * 0.5 + y * 0.31 + z * 0.17);
}

function noise4(x, y, z, t) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn4) return noiseFn4(x, y, z, t);
  fallbackHits += 1;
  return noise3(x + t * 0.21, y + t * 0.13, z + t * 0.09);
}

const DEFAULT_FLUID_CONFIG = {
  enabled: false,
  maxCount: 500,
  shape: 'icosa',
  size: 0.05,
  opacity: 0.78,
  colorStart: 0xffffff,
  colorEnd: 0x88aaff,
  flowMode: 'stream',
  flowDirection: { x: 0, y: 1, z: 0 },
  flowCenter: { x: 0, y: 0, z: 0 },
  flowStrength: 1.0,
  gravity: -0.6,
  spawnRate: 60,
  lifetime: 3.0,
  speed: 1.0,
  spread: 0.5,
  noise: 0.5,
  burstInterval: 4,
  curlScale: 1.2,
  curlSpeed: 0.25,
  excludeFromComposer: true,
  renderLayer: ORB_OVERLAY_RENDER_LAYER,
};

const _tmpCenter = new THREE.Vector3();
const _tmpDir = new THREE.Vector3();
const _tmpFlowDir = new THREE.Vector3();
const _tmpCurl = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _tmpColor = new THREE.Color();

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function log(ctx, message, level = 'info') {
  console.info(`[FluidParticles] ${message}`);
  if (ctx?.statusHandler) ctx.statusHandler(message, level);
}

function getRng(ctx) {
  return ctx?.ritualGenome?.rng || null;
}

function rnd(ctx) {
  const r = getRng(ctx);
  return r ? r.random() : Math.random();
}

function toColor(input, fallback) {
  try {
    if (input?.isColor) return input.clone();
    return new THREE.Color(input ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function stableColorKey(input, fallback) {
  return toColor(input, fallback).getHexString();
}

function stableConfigSignature(cfg) {
  return JSON.stringify({
    enabled: !!cfg.enabled,
    maxCount: cfg.maxCount,
    shape: cfg.shape,
    size: cfg.size,
    opacity: cfg.opacity,
    colorStart: stableColorKey(cfg.colorStart, 0xffffff),
    colorEnd: stableColorKey(cfg.colorEnd, 0x88aaff),
    flowMode: cfg.flowMode,
    flowDirection: cfg.flowDirection,
    flowCenter: cfg.flowCenter,
    flowStrength: cfg.flowStrength,
    gravity: cfg.gravity,
    spawnRate: cfg.spawnRate,
    lifetime: cfg.lifetime,
    speed: cfg.speed,
    spread: cfg.spread,
    noise: cfg.noise,
    burstInterval: cfg.burstInterval,
    curlScale: cfg.curlScale,
    curlSpeed: cfg.curlSpeed,
    excludeFromComposer: !!cfg.excludeFromComposer,
    renderLayer: cfg.renderLayer,
  });
}

function opticalConfigSignature(cfg) {
  return JSON.stringify({
    opacity: clamp01(cfg.opacity ?? 0.78),
    colorStart: stableColorKey(cfg.colorStart, 0xffffff),
    colorEnd: stableColorKey(cfg.colorEnd, 0x88aaff),
    blending: 'additive',
    toneMapped: false,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

function ensureState(ctx) {
  if (!ctx.fluidParticlesState) {
    ctx.fluidParticlesState = {
      mesh: null,
      particles: [],
      spawnAccumulator: 0,
      dummy: new THREE.Object3D(),
      lastBurst: 0,
      lastLogTime: 0,
      rebuildCount: 0,
      fallbackWarning: false,
      fallbackHits: 0,
      lastConfigSignature: '',
      lastOpticalSignature: '',
    };
  }
  return ctx.fluidParticlesState;
}

function syncLegacyHandle(ctx, mesh = null) {
  if (!ctx || typeof ctx !== 'object') return mesh ?? null;
  ctx.fluidParticles = mesh ?? null;
  return ctx.fluidParticles;
}

export function ensureFluidParticlesConfig(ctx) {
  if (!ctx.fluidParticlesConfig) {
    ctx.fluidParticlesConfig = { ...DEFAULT_FLUID_CONFIG };
  } else {
    ctx.fluidParticlesConfig = {
      ...DEFAULT_FLUID_CONFIG,
      ...ctx.fluidParticlesConfig,
    };
    ctx.fluidParticlesConfig.flowDirection = {
      ...DEFAULT_FLUID_CONFIG.flowDirection,
      ...(ctx.fluidParticlesConfig.flowDirection || {}),
    };
    ctx.fluidParticlesConfig.flowCenter = {
      ...DEFAULT_FLUID_CONFIG.flowCenter,
      ...(ctx.fluidParticlesConfig.flowCenter || {}),
    };
  }

  const cfg = ctx.fluidParticlesConfig;

  cfg.enabled = cfg.enabled !== false;
  cfg.excludeFromComposer = cfg.excludeFromComposer !== false;
  cfg.renderLayer = Math.max(
    0,
    Math.floor(
      Number(
        cfg.renderLayer ??
          (cfg.excludeFromComposer
            ? ORB_OVERLAY_RENDER_LAYER
            : ORB_BASE_RENDER_LAYER),
      ),
    ),
  );
  cfg.maxCount = Math.max(10, Math.floor(cfg.maxCount ?? 500));
  cfg.size = Math.max(0.005, Number(cfg.size ?? 0.05));
  cfg.opacity = clamp01(Number(cfg.opacity ?? 0.78));
  cfg.spawnRate = Math.max(0, Number(cfg.spawnRate ?? 60));
  cfg.lifetime = Math.max(0.3, Number(cfg.lifetime ?? 3));
  cfg.speed = Math.max(0, Number(cfg.speed ?? 1));
  cfg.spread = Math.max(0, Number(cfg.spread ?? 0.5));
  cfg.noise = Math.max(0, Number(cfg.noise ?? 0.5));
  cfg.flowStrength = Math.max(0, Number(cfg.flowStrength ?? 1.0));
  cfg.gravity = Number(cfg.gravity ?? -0.6);
  cfg.burstInterval = Math.max(0.2, Number(cfg.burstInterval ?? 4));
  cfg.curlScale = Math.max(0.2, Number(cfg.curlScale ?? 1.2));
  cfg.curlSpeed = Math.max(0.01, Number(cfg.curlSpeed ?? 0.25));

  return cfg;
}

function disposeMesh(ctx, state) {
  if (!state?.mesh) {
    syncLegacyHandle(ctx, null);
    return;
  }

  state.mesh.parent?.remove(state.mesh);
  state.mesh.geometry?.dispose?.();
  state.mesh.material?.dispose?.();
  state.mesh = null;

  syncLegacyHandle(ctx, null);
}

function buildGeometry(cfg) {
  if (cfg.shape === 'box') {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  return new THREE.IcosahedronGeometry(0.5, 2);
}

function buildMaterial(cfg) {
  return new THREE.MeshBasicMaterial({
    color: toColor(cfg.colorStart, 0xffffff),
    transparent: true,
    opacity: clamp01(cfg.opacity ?? 0.78),
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
  });
}

function ensureInstanceColor(mesh, maxCount) {
  if (!mesh) return null;
  const attr = new THREE.InstancedBufferAttribute(
    new Float32Array(maxCount * 3),
    3,
  );
  mesh.instanceColor = attr;
  return attr;
}

function applyMeshRenderIsolation(mesh, cfg) {
  if (!mesh) return;

  const layer =
    cfg.excludeFromComposer === false
      ? ORB_BASE_RENDER_LAYER
      : Math.max(
          0,
          Math.floor(Number(cfg.renderLayer ?? ORB_OVERLAY_RENDER_LAYER)),
        );

  mesh.layers.set(layer);
  mesh.renderOrder = layer === ORB_OVERLAY_RENDER_LAYER ? 10 : 0;
  mesh.frustumCulled = false;

  mesh.userData = {
    ...(mesh.userData || {}),
    renderAuditCategory: 'fluid-particles',
    excludeFromComposer: layer !== ORB_BASE_RENDER_LAYER,
    overlayLayer: layer,
    postprocessIsolation: layer !== ORB_BASE_RENDER_LAYER,
    opacityBase: clamp01(cfg.opacity ?? 0.78),
  };
}

function replaceMaterialIfNeeded(state, cfg) {
  if (!state?.mesh) return;

  const nextSignature = opticalConfigSignature(cfg);
  if (state.lastOpticalSignature === nextSignature && state.mesh.material) {
    return;
  }

  const previousMaterial = state.mesh.material;
  state.mesh.material = buildMaterial(cfg);
  state.lastOpticalSignature = nextSignature;

  previousMaterial?.dispose?.();
}

export function resetFluidParticles(ctx) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);

  state.spawnAccumulator = 0;
  state.lastBurst = 0;
  state.lastLogTime = 0;
  state.particles.length = 0;

  if (state.mesh) {
    replaceMaterialIfNeeded(state, cfg);
    state.mesh.count = 0;
    state.mesh.visible = !!cfg.enabled;
    applyMeshRenderIsolation(state.mesh, cfg);
    state.mesh.instanceMatrix.needsUpdate = true;
    if (state.mesh.instanceColor) {
      state.mesh.instanceColor.needsUpdate = true;
    }
    syncLegacyHandle(ctx, state.mesh);
  } else {
    syncLegacyHandle(ctx, null);
  }

  log(ctx, 'Reset particules fluide.');
}

/**
 * Alias de compatibilité legacy.
 * Permet à RitualOrchestrator d'appeler encore initFluidParticles()
 * sans warning Rollup ni rupture de contrat.
 */
export function initFluidParticles(ctx) {
  ensureFluidParticlesConfig(ctx);
  const mesh = buildFluidParticles(ctx);
  return syncLegacyHandle(ctx, mesh ?? null);
}

export function buildFluidParticles(ctx) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);

  disposeMesh(ctx, state);

  const geometry = buildGeometry(cfg);
  const material = buildMaterial(cfg);
  const mesh = new THREE.InstancedMesh(geometry, material, cfg.maxCount);

  mesh.name = 'FluidParticles';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ensureInstanceColor(mesh, cfg.maxCount);
  mesh.count = 0;
  mesh.visible = !!cfg.enabled;

  applyMeshRenderIsolation(mesh, cfg);

  (ctx.orbGroup || ctx.scene)?.add(mesh);

  state.mesh = mesh;
  state.particles = [];
  state.spawnAccumulator = 0;
  state.lastBurst = 0;
  state.rebuildCount = (state.rebuildCount || 0) + 1;
  state.lastConfigSignature = stableConfigSignature(cfg);
  state.lastOpticalSignature = opticalConfigSignature(cfg);

  syncLegacyHandle(ctx, mesh);

  log(ctx, 'Rebuild instanced mesh.');
  return mesh;
}

function mergeConfig(target, patch) {
  if (!patch || typeof patch !== 'object') return target;

  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = { ...value };
      } else {
        mergeConfig(target[key], value);
      }
    } else {
      target[key] = value;
    }
  }

  return target;
}

export function setFluidParticlesEnabled(ctx, enabled) {
  return setFluidParticlesConfig(ctx, { enabled: Boolean(enabled) });
}

export function setFluidParticlesConfig(ctx, patch = {}) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);

  const prevMax = cfg.maxCount;
  const prevShape = cfg.shape;
  const prevExclude = cfg.excludeFromComposer;
  const prevLayer = cfg.renderLayer;

  mergeConfig(cfg, patch);
  ensureFluidParticlesConfig(ctx);

  const nextSignature = stableConfigSignature(cfg);
  const changed = nextSignature !== state.lastConfigSignature;

  const structuralChanged =
    ('maxCount' in patch && cfg.maxCount !== prevMax) ||
    ('shape' in patch && cfg.shape !== prevShape) ||
    ('excludeFromComposer' in patch &&
      cfg.excludeFromComposer !== prevExclude) ||
    ('renderLayer' in patch && cfg.renderLayer !== prevLayer);

  if (!state.mesh || structuralChanged) {
    buildFluidParticles(ctx);
  } else if (state.mesh) {
    replaceMaterialIfNeeded(state, cfg);
    state.mesh.visible = !!cfg.enabled;
    applyMeshRenderIsolation(state.mesh, cfg);
    syncLegacyHandle(ctx, state.mesh);
  }

  if (changed) {
    state.lastConfigSignature = nextSignature;
    log(ctx, 'Config particules fluide mise à jour.');
  }

  return cfg;
}

function spawnParticle(ctx, state, cfg) {
  if (!state.mesh) return;

  const spread = cfg.spread ?? 0.5;
  _tmpCenter.set(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);

  const pos = new THREE.Vector3(
    _tmpCenter.x + (rnd(ctx) - 0.5) * spread,
    _tmpCenter.y + (rnd(ctx) - 0.5) * spread,
    _tmpCenter.z + (rnd(ctx) - 0.5) * spread,
  );

  _tmpDir.set(cfg.flowDirection.x, cfg.flowDirection.y, cfg.flowDirection.z);
  if (_tmpDir.lengthSq() === 0) _tmpDir.set(0, 1, 0);
  _tmpDir.normalize().multiplyScalar(cfg.speed ?? 1.0);

  const n = cfg.noise ?? 0.4;
  _tmpDir.x += (rnd(ctx) - 0.5) * n;
  _tmpDir.y += (rnd(ctx) - 0.5) * n;
  _tmpDir.z += (rnd(ctx) - 0.5) * n;

  state.particles.push({
    position: pos,
    velocity: _tmpDir.clone(),
    age: 0,
    lifetime: cfg.lifetime,
    seed: rnd(ctx) * 2 - 1,
  });

  if (state.particles.length > cfg.maxCount) state.particles.shift();
}

function curlField(p, t, cfg) {
  const s = cfg.curlScale ?? 1.2;
  const sp = cfg.curlSpeed ?? 0.25;

  const x = p.position.x * s;
  const y = p.position.y * s;
  const z = p.position.z * s;
  const e = 0.001;

  const n1 = noise4(x, y, z, t * sp);
  const nx = noise4(x + e, y, z, t * sp);
  const ny = noise4(x, y + e, z, t * sp);
  const nz = noise4(x, y, z + e, t * sp);

  const dx = (nx - n1) / e;
  const dy = (ny - n1) / e;
  const dz = (nz - n1) / e;

  _tmpCurl.set(dy - dz, dz - dx, dx - dy);
  if (_tmpCurl.lengthSq() > 0) _tmpCurl.normalize();

  return _tmpCurl;
}

function applyFlowForces(p, cfg, delta, time) {
  const strength = cfg.flowStrength ?? 1;

  switch (cfg.flowMode) {
    case 'vortex': {
      _tmpCenter.set(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);
      _tmpVec.copy(p.position).sub(_tmpCenter);

      const angle = strength * delta;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const nx = _tmpVec.x * cosA - _tmpVec.z * sinA;
      const nz = _tmpVec.x * sinA + _tmpVec.z * cosA;

      _tmpVec.x = nx;
      _tmpVec.z = nz;

      p.position.copy(_tmpCenter).add(_tmpVec);
      p.velocity.y += Math.sin(angle) * 0.35 * delta;
      break;
    }

    case 'fall': {
      p.velocity.y -= Math.abs(strength) * delta * 2.2;
      break;
    }

    case 'suction': {
      _tmpCenter.set(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);
      _tmpVec.copy(_tmpCenter).sub(p.position);
      if (_tmpVec.lengthSq() > 0) {
        _tmpVec.normalize();
        p.velocity.addScaledVector(_tmpVec, strength * delta);
      }
      break;
    }

    case 'burst': {
      p.velocity.y += strength * delta * 4.2;
      break;
    }

    case 'curl': {
      const curl = curlField(p, time, cfg);
      p.velocity.addScaledVector(curl, strength * delta * 1.6);
      break;
    }

    case 'stream':
    default: {
      _tmpFlowDir.set(
        cfg.flowDirection.x,
        cfg.flowDirection.y,
        cfg.flowDirection.z,
      );
      if (_tmpFlowDir.lengthSq() === 0) _tmpFlowDir.set(0, 1, 0);
      _tmpFlowDir.normalize();
      p.velocity.addScaledVector(_tmpFlowDir, strength * delta * 0.5);
      break;
    }
  }
}

export function updateFluidParticles(ctx, delta) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);

  state.fallbackHits = fallbackHits;
  if (fallbackHits > 10 && !state.fallbackWarning) {
    state.fallbackWarning = true;
    console.warn('[FluidParticles] Simplex fallback used frequently.');
  }

  if (ctx.orbGroup) {
    cfg.flowCenter = { x: 0, y: 0, z: 0 };
  }

  if (!state.mesh) buildFluidParticles(ctx);
  const mesh = state.mesh;
  if (!mesh) return;

  replaceMaterialIfNeeded(state, cfg);
  applyMeshRenderIsolation(mesh, cfg);
  syncLegacyHandle(ctx, mesh);

  if (!cfg.enabled) {
    mesh.visible = false;
    mesh.count = 0;
    return;
  }

  mesh.visible = true;

  state.spawnAccumulator += (cfg.spawnRate ?? 0) * delta;
  while (state.spawnAccumulator >= 1) {
    spawnParticle(ctx, state, cfg);
    state.spawnAccumulator -= 1;
  }

  const now =
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) /
    1000;

  const burstCooldown = cfg.burstInterval ?? 4;
  const doBurst =
    cfg.flowMode === 'burst' && now - state.lastBurst > burstCooldown;

  if (doBurst) {
    state.particles.forEach((p) => {
      p.velocity.y += cfg.flowStrength * 2.0;
    });
    state.lastBurst = now;
  }

  const startColor = toColor(cfg.colorStart, 0xffffff);
  const endColor = toColor(cfg.colorEnd, 0x88aaff);
  const energy = ctx?.ritualGenome?.motion?.energy ?? 0.5;
  const palette = ctx?.ritualGenome?.palette;
  const tint = palette?.primary?.isColor ? palette.primary : null;
  const attr = mesh.instanceColor;
  const dummy = state.dummy;

  let count = 0;
  const gravity = cfg.gravity ?? -0.6;
  const time = now;

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];

    p.age += delta;
    if (p.age >= p.lifetime) {
      state.particles.splice(i, 1);
      continue;
    }

    p.velocity.y += gravity * delta;
    applyFlowForces(p, cfg, delta, time);

    const n = cfg.noise ?? 0.4;
    p.velocity.x +=
      noise2(p.seed + time * 0.6, p.position.y * 0.9) * n * 0.06 * delta;
    p.velocity.z +=
      noise2(p.position.x * 0.9, p.seed + time * 0.6) * n * 0.06 * delta;

    const damp = 0.985 - energy * 0.08;
    p.velocity.multiplyScalar(damp);
    p.position.addScaledVector(p.velocity, delta);

    dummy.position.copy(p.position);

    const size = (cfg.size ?? 0.05) * (0.85 + energy * 0.35);
    dummy.scale.setScalar(size);
    dummy.rotation.set(
      p.seed * Math.PI * 0.35 + p.age * 0.3,
      p.seed * Math.PI * 0.5 + p.age * (0.6 + energy),
      p.seed * Math.PI * 0.2 + p.age * 0.2,
    );
    dummy.updateMatrix();

    mesh.setMatrixAt(count, dummy.matrix);

    if (attr) {
      const t = THREE.MathUtils.clamp(p.age / p.lifetime, 0, 1);
      _tmpColor.copy(startColor).lerp(endColor, t);
      if (tint) _tmpColor.lerp(tint, 0.15);

      attr.array[count * 3] = _tmpColor.r;
      attr.array[count * 3 + 1] = _tmpColor.g;
      attr.array[count * 3 + 2] = _tmpColor.b;
    }

    count += 1;
    if (count >= cfg.maxCount) break;
  }

  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (attr) attr.needsUpdate = true;

  if (!state.lastLogTime || now - state.lastLogTime > 4) {
    log(ctx, `Particules fluide: ${count}`);
    state.lastLogTime = now;
  }
}
