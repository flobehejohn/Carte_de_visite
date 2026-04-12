import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * orbFluidParticles — version "Ultime"
 * - InstancedMesh (performance)
 * - Modes: stream / vortex / suction / burst / curl
 * - Couleurs et énergie dérivées de ctx.ritualGenome (interdépendance)
 * - RNG seedé si disponible
 */

const simplex = new SimplexNoise();
let simplexModeLogged = false;
let fallbackHits = 0;
let fallbackWarned = false;

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
  const mode2 = noiseFn2 ? (noiseFn2.name || 'custom2') : 'fallback';
  const mode3 = noiseFn3 ? (noiseFn3.name || 'custom3') : 'fallback';
  const mode4 = noiseFn4 ? (noiseFn4.name || 'custom4') : 'fallback';
  console.info(`[FluidParticles] simplex wrapper mode: 2->${mode2}, 3->${mode3}, 4->${mode4}`);
}

function noise2(x, y) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn2) return noiseFn2(x, y);
  fallbackHits++;
  return Math.sin(x * 0.73 + y * 0.37); // fallback déterministe
}

function noise3(x, y, z) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn3) return noiseFn3(x, y, z);
  fallbackHits++;
  return Math.sin(x * 0.5 + y * 0.31 + z * 0.17);
}

function noise4(x, y, z, t) {
  if (!simplexModeLogged) logSimplexMode();
  if (noiseFn4) return noiseFn4(x, y, z, t);
  fallbackHits++;
  // fallback basé sur noise3
  return noise3(x + t * 0.21, y + t * 0.13, z + t * 0.09);
}

const DEFAULT_FLUID_CONFIG = {
  enabled: false,
  maxCount: 500,
  shape: 'icosa', // icosa | box

  size: 0.05,

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

  // curl field
  curlScale: 1.2,
  curlSpeed: 0.25,
};

function log(ctx, message, level = 'info') {
  console.info(`[FluidParticles] ${message}`);
  if (ctx.statusHandler) ctx.statusHandler(message, level);
}

function getRng(ctx) {
  return ctx?.ritualGenome?.rng || null;
}
function rnd(ctx) {
  const r = getRng(ctx);
  return r ? r.random() : Math.random();
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
      fallbackHits: 0
    };
  }
  return ctx.fluidParticlesState;
}

export function ensureFluidParticlesConfig(ctx) {
  if (!ctx.fluidParticlesConfig) {
    ctx.fluidParticlesConfig = { ...DEFAULT_FLUID_CONFIG };
  } else {
    ctx.fluidParticlesConfig = { ...DEFAULT_FLUID_CONFIG, ...ctx.fluidParticlesConfig };
    ctx.fluidParticlesConfig.flowDirection = {
      ...DEFAULT_FLUID_CONFIG.flowDirection,
      ...(ctx.fluidParticlesConfig.flowDirection || {})
    };
    ctx.fluidParticlesConfig.flowCenter = {
      ...DEFAULT_FLUID_CONFIG.flowCenter,
      ...(ctx.fluidParticlesConfig.flowCenter || {})
    };
  }

  const cfg = ctx.fluidParticlesConfig;
  cfg.enabled = cfg.enabled !== false;

  cfg.maxCount = Math.max(10, Math.floor(cfg.maxCount ?? 500));
  cfg.size = Math.max(0.005, Number(cfg.size ?? 0.05));
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

function disposeMesh(state) {
  if (!state?.mesh) return;
  state.mesh.parent?.remove(state.mesh);
  state.mesh.geometry?.dispose();
  state.mesh.material?.dispose();
  state.mesh = null;
}

function buildGeometry(cfg) {
  if (cfg.shape === 'box') {
    return new THREE.BoxGeometry(1, 1, 1);
  }
  return new THREE.IcosahedronGeometry(0.5, 2);
}

function toColor(input, fallback) {
  try {
    if (input?.isColor) return input.clone();
    return new THREE.Color(input ?? fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

function buildMaterial(cfg) {
  const material = new THREE.MeshStandardMaterial({
    color: toColor(cfg.colorStart, 0xffffff),
    emissive: new THREE.Color(0x04060a),
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true
  });
  return material;
}

function ensureInstanceColor(mesh, maxCount) {
  if (!mesh) return null;
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);
  mesh.instanceColor = attr;
  return attr;
}

export function buildFluidParticles(ctx) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);
  disposeMesh(state);

  const geometry = buildGeometry(cfg);
  const material = buildMaterial(cfg);
  const mesh = new THREE.InstancedMesh(geometry, material, cfg.maxCount);
  mesh.name = 'FluidParticles';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ensureInstanceColor(mesh, cfg.maxCount);
  mesh.count = 0;
  mesh.visible = !!cfg.enabled;

  (ctx.orbGroup || ctx.scene)?.add(mesh);

  state.mesh = mesh;
  state.particles = [];
  state.spawnAccumulator = 0;
  state.lastBurst = 0;
  state.rebuildCount = (state.rebuildCount || 0) + 1;

  log(ctx, 'Rebuild instanced mesh.');
  return mesh;
}

function mergeConfig(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = { ...value };
      else mergeConfig(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

export function setFluidParticlesConfig(ctx, patch = {}) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);

  const prevMax = cfg.maxCount;
  const prevShape = cfg.shape;

  mergeConfig(cfg, patch);
  ensureFluidParticlesConfig(ctx);

  const structuralChanged =
    (('maxCount' in patch) && cfg.maxCount !== prevMax) ||
    (('shape' in patch) && cfg.shape !== prevShape);

  if (structuralChanged || !state.mesh) {
    buildFluidParticles(ctx);
  } else if (state.mesh) {
    state.mesh.visible = !!cfg.enabled;
    // Mise à jour in-place pour les paramètres dynamiques : aucune reconstruction
  }

  log(ctx, 'Config particules fluide mise à jour.');
  // Test manuel: appeler setFluidParticlesConfig 5x avec mêmes maxCount/shape -> rebuildCount ne bouge pas.
  return cfg;
}

/* ------------------------- Physique / forces ------------------------- */
function spawnParticle(ctx, state, cfg) {
  if (!state.mesh) return;

  const center = new THREE.Vector3(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);
  const spread = cfg.spread ?? 0.5;

  // spawn autour du centre (ancre orb)
  const pos = new THREE.Vector3(
    center.x + (rnd(ctx) - 0.5) * spread,
    center.y + (rnd(ctx) - 0.5) * spread,
    center.z + (rnd(ctx) - 0.5) * spread
  );

  const dir = new THREE.Vector3(cfg.flowDirection.x, cfg.flowDirection.y, cfg.flowDirection.z);
  if (dir.lengthSq() === 0) dir.set(0, 1, 0);
  dir.normalize().multiplyScalar(cfg.speed ?? 1.0);

  // bruit initial
  const n = cfg.noise ?? 0.4;
  dir.x += (rnd(ctx) - 0.5) * n;
  dir.y += (rnd(ctx) - 0.5) * n;
  dir.z += (rnd(ctx) - 0.5) * n;

  state.particles.push({
    position: pos,
    velocity: dir,
    age: 0,
    lifetime: cfg.lifetime,
    seed: rnd(ctx) * 2 - 1
  });

  if (state.particles.length > cfg.maxCount) state.particles.shift();
}

function curlField(p, t, cfg) {
  // Curl approximé via dérivées du simplex (2D slices)
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

  // rotation "curl-like"
  const curl = new THREE.Vector3(dy - dz, dz - dx, dx - dy);
  if (curl.lengthSq() > 0) curl.normalize();
  return curl;
}

function applyFlowForces(p, cfg, delta, time) {
  const strength = cfg.flowStrength ?? 1;

  switch (cfg.flowMode) {
    case 'vortex': {
      const center = new THREE.Vector3(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);
      const dir = p.position.clone().sub(center);
      const angle = strength * delta;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const nx = dir.x * cosA - dir.z * sinA;
      const nz = dir.x * sinA + dir.z * cosA;
      dir.x = nx; dir.z = nz;
      p.position.copy(center.clone().add(dir));
      p.velocity.y += Math.sin(angle) * 0.35 * delta;
      break;
    }

    case 'fall': {
      p.velocity.y -= Math.abs(strength) * delta * 2.2;
      break;
    }

    case 'suction': {
      const center = new THREE.Vector3(cfg.flowCenter.x, cfg.flowCenter.y, cfg.flowCenter.z);
      const dir = center.sub(p.position).normalize();
      p.velocity.addScaledVector(dir, strength * delta);
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
      const dir = new THREE.Vector3(cfg.flowDirection.x, cfg.flowDirection.y, cfg.flowDirection.z).normalize();
      p.velocity.addScaledVector(dir, strength * delta * 0.5);
      break;
    }
  }
}

export function updateFluidParticles(ctx, delta) {
  const cfg = ensureFluidParticlesConfig(ctx);
  const state = ensureState(ctx);
  // Propager un warning si fallback noise est utilisé trop souvent
  state.fallbackHits = fallbackHits;
  if (fallbackHits > 10 && !state.fallbackWarning) {
    state.fallbackWarning = true;
    console.warn('[FluidParticles] Simplex fallback used frequently.');
  }

  // ancre sur orb
  if (ctx.orbGroup) {
    cfg.flowCenter = { x: 0, y: 0, z: 0 };
  }

  if (!state.mesh) buildFluidParticles(ctx);
  const mesh = state.mesh;
  if (!mesh) return;

  if (!cfg.enabled) {
    mesh.visible = false;
    mesh.count = 0;
    return;
  }
  mesh.visible = true;

  // spawn
  state.spawnAccumulator += (cfg.spawnRate ?? 0) * delta;
  while (state.spawnAccumulator >= 1) {
    spawnParticle(ctx, state, cfg);
    state.spawnAccumulator -= 1;
  }

  // burst global (cooldown)
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const burstCooldown = cfg.burstInterval ?? 4;
  const doBurst = cfg.flowMode === 'burst' && now - state.lastBurst > burstCooldown;
  if (doBurst) {
    state.particles.forEach(p => { p.velocity.y += cfg.flowStrength * 2.0; });
    state.lastBurst = now;
  }

  const startColor = toColor(cfg.colorStart, 0xffffff);
  const endColor = toColor(cfg.colorEnd, 0x88aaff);

  // palette / énergie du rituel (interdépendance)
  const energy = ctx?.ritualGenome?.motion?.energy ?? 0.5;
  const palette = ctx?.ritualGenome?.palette;
  const tint = palette?.primary?.isColor ? palette.primary : null;

  const attr = mesh.instanceColor;
  const dummy = state.dummy;

  let count = 0;
  const gravity = cfg.gravity ?? -0.6;
  const time = now;

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.age += delta;
    if (p.age >= p.lifetime) {
      state.particles.splice(i, 1);
      continue;
    }

    // forces
    p.velocity.y += gravity * delta;
    applyFlowForces(p, cfg, delta, time);

    // micro noise: évite rigidité
    const n = cfg.noise ?? 0.4;
    p.velocity.x += noise2(p.seed + time * 0.6, p.position.y * 0.9) * n * 0.06 * delta;
    p.velocity.z += noise2(p.position.x * 0.9, p.seed + time * 0.6) * n * 0.06 * delta;

    // damping
    const damp = 0.985 - energy * 0.08;
    p.velocity.multiplyScalar(damp);

    // move
    p.position.addScaledVector(p.velocity, delta);

    dummy.position.copy(p.position);

    const size = (cfg.size ?? 0.05) * (0.85 + energy * 0.35);
    dummy.scale.setScalar(size);

    dummy.rotation.y += delta * (0.6 + energy);
    dummy.rotation.x += delta * 0.3;
    dummy.updateMatrix();

    mesh.setMatrixAt(count, dummy.matrix);

    // color life
    if (attr) {
      const t = THREE.MathUtils.clamp(p.age / p.lifetime, 0, 1);
      const col = startColor.clone().lerp(endColor, t);
      if (tint) col.lerp(tint, 0.15);
      attr.array[count * 3] = col.r;
      attr.array[count * 3 + 1] = col.g;
      attr.array[count * 3 + 2] = col.b;
    }

    count++;
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
