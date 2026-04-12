import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * orbParticles — version "Ultime" (corrigée)
 * - Modes: points / links / trails
 * - Variabilité énorme via ctx.ritualGenome.particles
 * - Liens dynamiques (lents) + bursts rapides (sans agresser)
 * - Spatial hash léger pour les liens
 *
 * Correctifs:
 * - Tous les SINKS d'opacité appliquent ctx.appliedOpacityParticlesMul (audit-opacity-sinks)
 * - Le mul peut changer sans rebuild: opacité réappliquée à chaque frame (animate/updateLinks/updateTrails)
 */

const simplex = new SimplexNoise();

const DEFAULTS = {
  enabled: true,

  count: 320,
  size: 0.12,
  opacity: 0.55,
  color1: new THREE.Color(0xffffff),
  color2: new THREE.Color(0xffaa00),

  radiusFactor: 1.6,
  distribution: 'shell', // shell | volume

  mode: 'points', // points | links | trails
  linkDistance: 1.2,
  trailLength: 12,
  trailFade: 0.9,

  // dynamiques
  dynamics: {
    lfoSpeed: 0.14,
    maxNeighbors: 28,
    burst: false, // injecté par l'orchestrateur
  },
};

function clamp01(x) {
  return Math.max(0, Math.min(1, Number(x) || 0));
}

/**
 * Retourne le mul "particules" (>=0), basé sur ctx.appliedOpacityParticlesMul
 * (audit-opacity-sinks attend un lien explicite à cette propriété).
 */
function getParticlesOpacityMul(ctx) {
  const m = ctx?.appliedOpacityParticlesMul;
  return Number.isFinite(m) ? Math.max(0, m) : 1.0;
}

/**
 * Compat : si d'autres appels existent ailleurs dans le codebase.
 * On garde l'ancien nom, mais il délègue vers la version explicite.
 */
function getOpacityMul(ctx) {
  return getParticlesOpacityMul(ctx);
}

function applyOpacityToMaterials(ctx, cfg) {
  // IMPORTANT: variable explicitement reliée à ctx.appliedOpacityParticlesMul
  const particlesMul = getParticlesOpacityMul(ctx);
  const base = clamp01(cfg.opacity);

  // Points: suit toujours le mul (sinon changement de climate mul ne se répercute pas)
  if (ctx.particlesPoints?.material) {
    ctx.particlesPoints.material.opacity = base * particlesMul;
  }

  // Trails: base * 0.9 (le reste est dans la couleur/alpha des sommets)
  if (ctx.particlesTrails?.material) {
    ctx.particlesTrails.material.opacity = base * 0.9 * particlesMul;
  }

  // Links: valeur "par défaut" quand links n'est pas actif (quand actif, updateParticleLinks gère dynamique)
  if (ctx.particlesLinks?.material && cfg.mode !== 'links') {
    ctx.particlesLinks.material.opacity = Math.min(1, base * 0.45) * particlesMul;
  }
}

function ensureConfig(ctx) {
  if (!ctx.particlesConfig) ctx.particlesConfig = structuredClone(DEFAULTS);
  else {
    ctx.particlesConfig = {
      ...DEFAULTS,
      ...ctx.particlesConfig,
      color1: ctx.particlesConfig.color1 ?? DEFAULTS.color1,
      color2: ctx.particlesConfig.color2 ?? DEFAULTS.color2,
      dynamics: { ...DEFAULTS.dynamics, ...(ctx.particlesConfig.dynamics || {}) },
    };
  }

  // normalize colors
  if (!ctx.particlesConfig.color1?.isColor)
    ctx.particlesConfig.color1 = new THREE.Color(ctx.particlesConfig.color1 || 0xffffff);
  if (!ctx.particlesConfig.color2?.isColor)
    ctx.particlesConfig.color2 = new THREE.Color(ctx.particlesConfig.color2 || 0xffaa00);

  ctx.particlesConfig.count = Math.max(10, Math.floor(ctx.particlesConfig.count ?? 320));
  ctx.particlesConfig.size = Math.max(0.005, Number(ctx.particlesConfig.size ?? 0.12));
  ctx.particlesConfig.opacity = clamp01(ctx.particlesConfig.opacity ?? 0.55);
  ctx.particlesConfig.linkDistance = Math.max(0.2, Number(ctx.particlesConfig.linkDistance ?? 1.2));
  ctx.particlesConfig.trailLength = Math.max(3, Math.floor(ctx.particlesConfig.trailLength ?? 12));
  ctx.particlesConfig.trailFade = Math.max(0.6, Math.min(0.98, Number(ctx.particlesConfig.trailFade ?? 0.9)));
  ctx.particlesConfig.radiusFactor = Math.max(0.6, Math.min(3.0, Number(ctx.particlesConfig.radiusFactor ?? 1.6)));

  ctx.particlesConfig.dynamics.lfoSpeed = Math.max(
    0.03,
    Math.min(0.6, Number(ctx.particlesConfig.dynamics.lfoSpeed ?? 0.14))
  );
  ctx.particlesConfig.dynamics.maxNeighbors = Math.max(
    8,
    Math.min(64, Math.floor(ctx.particlesConfig.dynamics.maxNeighbors ?? 28))
  );
  ctx.particlesConfig.dynamics.burst = !!ctx.particlesConfig.dynamics.burst;

  return ctx.particlesConfig;
}

function getRng(ctx) {
  return ctx?.ritualGenome?.rng || null;
}
function rnd(ctx) {
  const r = getRng(ctx);
  return r ? r.random() : Math.random();
}

function disposeObj(ctx, obj) {
  if (!obj) return;
  if (obj.geometry) obj.geometry.dispose();
  if (obj.material) obj.material.dispose();
  obj.parent?.remove(obj);
}

export function createInnerParticles(ctx) {
  // cleanup
  disposeObj(ctx, ctx.particlesPoints);
  disposeObj(ctx, ctx.particlesLinks);
  disposeObj(ctx, ctx.particlesTrails);
  ctx.particlesPoints = null;
  ctx.particlesLinks = null;
  ctx.particlesTrails = null;
  ctx.trailHistory = [];

  const cfg = ensureConfig(ctx);
  if (cfg.enabled === false) return;

  const baseRadius = ctx.orbShellConfig?.radius || 2.2;
  const radius = Math.max(0.1, baseRadius * (cfg.radiusFactor ?? 1.6));

  const count = cfg.count;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const basePos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  // dynamique
  const speeds = new Float32Array(count);
  const phase = new Float32Array(count);
  const seed = new Float32Array(count);
  const velocity = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = rnd(ctx);
    const v = rnd(ctx);
    const w = rnd(ctx);

    let x, y, z;

    if (cfg.distribution === 'shell') {
      const theta = 2 * Math.PI * v;
      const phi = Math.acos(2 * w - 1);
      x = radius * Math.sin(phi) * Math.cos(theta);
      y = radius * Math.sin(phi) * Math.sin(theta);
      z = radius * Math.cos(phi);
    } else {
      // volume: distribution uniforme
      const r = radius * Math.cbrt(u);
      const theta = 2 * Math.PI * v;
      const phi = Math.acos(2 * w - 1);
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    }

    const idx = i * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;
    basePos[idx] = x;
    basePos[idx + 1] = y;
    basePos[idx + 2] = z;

    speeds[i] = 0.55 + rnd(ctx) * 1.75;
    phase[i] = rnd(ctx) * Math.PI * 2;
    seed[i] = rnd(ctx) * 2 - 1;

    // petite vitesse initiale (orbite)
    velocity[idx] = (rnd(ctx) * 2 - 1) * 0.05;
    velocity[idx + 1] = (rnd(ctx) * 2 - 1) * 0.05;
    velocity[idx + 2] = (rnd(ctx) * 2 - 1) * 0.05;

    const mix = rnd(ctx);
    const c = cfg.color1.clone().lerp(cfg.color2, mix);
    colors[idx] = c.r;
    colors[idx + 1] = c.g;
    colors[idx + 2] = c.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('basePosition', new THREE.BufferAttribute(basePos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geometry.setAttribute('velocity', new THREE.BufferAttribute(velocity, 3));

  // IMPORTANT: variable explicitement reliée à ctx.appliedOpacityParticlesMul
  const particlesMul = getParticlesOpacityMul(ctx);

  // Points
  const pMat = new THREE.PointsMaterial({
    size: cfg.size,
    vertexColors: true,
    transparent: true,
    opacity: clamp01(cfg.opacity) * particlesMul,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  ctx.particlesPoints = new THREE.Points(geometry, pMat);
  ctx.particlesPoints.frustumCulled = false;
  (ctx.orbGroup || ctx.scene).add(ctx.particlesPoints);

  // Links (LineSegments)
  const maxSegments = Math.max(2000, count * 10);
  const linkPositions = new Float32Array(maxSegments * 6);
  const linkGeometry = new THREE.BufferGeometry();
  linkGeometry.setAttribute('position', new THREE.BufferAttribute(linkPositions, 3));
  const linkMaterial = new THREE.LineBasicMaterial({
    color: cfg.color1,
    transparent: true,
    opacity: Math.min(1, clamp01(cfg.opacity) * 0.45) * particlesMul,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  ctx.particlesLinks = new THREE.LineSegments(linkGeometry, linkMaterial);
  ctx.particlesLinks.visible = false;
  ctx.particlesLinks.userData.maxSegments = maxSegments;
  (ctx.orbGroup || ctx.scene).add(ctx.particlesLinks);

  // Trails (Points)
  const trailLen = cfg.trailLength || 12;
  const maxTrailVertices = count * trailLen;
  const trailPositions = new Float32Array(maxTrailVertices * 3);
  const trailColors = new Float32Array(maxTrailVertices * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMaterial = new THREE.PointsMaterial({
    size: cfg.size * 0.75,
    vertexColors: true,
    transparent: true,
    opacity: clamp01(cfg.opacity) * particlesMul,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  ctx.particlesTrails = new THREE.Points(trailGeometry, trailMaterial);
  ctx.particlesTrails.visible = false;
  (ctx.orbGroup || ctx.scene).add(ctx.particlesTrails);
}

/**
 * Animation: mélange orbite + noise + "burst"
 * turbulence: 0..~1.5 (piloté par orchestrateur)
 */
export function animateParticles(ctx, time, turbulence = 0.25) {
  if (!ctx.particlesPoints) return;

  const cfg = ensureConfig(ctx);
  applyOpacityToMaterials(ctx, cfg);

  const geom = ctx.particlesPoints.geometry;
  const pos = geom.attributes.position.array;
  const base = geom.attributes.basePosition.array;
  const spd = geom.attributes.speed.array;
  const phase = geom.attributes.phase.array;
  const seed = geom.attributes.seed.array;
  const vel = geom.attributes.velocity.array;

  const count = pos.length / 3;

  // énergie globale (rituel)
  const energy = ctx?.ritualGenome?.motion?.energy ?? 0.5;
  const isBurst = !!cfg.dynamics?.burst;
  const burstBoost = isBurst ? 1.0 : 0.0;

  const globalSpeed = 0.14 + energy * 0.28 + burstBoost * 0.22;
  const amp = (0.18 + turbulence * 0.55) * (1.0 + burstBoost * 0.65);

  // légère attraction vers le "shell" (stabilité)
  const pull = 0.04 + energy * 0.08;

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const bx = base[idx];
    const by = base[idx + 1];
    const bz = base[idx + 2];

    const s = spd[i];
    const ph = phase[i];
    const si = seed[i];

    // champ noise 4D (doux)
    const nx = simplex.noise4d(bx * 0.55, by * 0.55, bz * 0.55, time * globalSpeed * s);
    const ny = simplex.noise4d(bx * 0.55 + 13.7, by * 0.55, bz * 0.55, time * globalSpeed * s);
    const nz = simplex.noise4d(bx * 0.55, by * 0.55 + 19.1, bz * 0.55, time * globalSpeed * s);

    // orbite: rotation autour Y
    const rot = time * (0.08 + energy * 0.18) + ph;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    const ox = bx * cos - bz * sin;
    const oz = bx * sin + bz * cos;

    // "burst": accélération courte + micro-jitter
    const burst =
      burstBoost * (0.65 + 0.35 * Math.sin(time * 6.0 + ph)) * (0.35 + 0.65 * Math.abs(si));

    // vitesse intégrée (suavise le mouvement)
    vel[idx] += (nx * 0.04 + (rnd(ctx) - 0.5) * 0.01) * (1 + burst);
    vel[idx + 1] += (ny * 0.04 + (rnd(ctx) - 0.5) * 0.01) * (1 + burst);
    vel[idx + 2] += (nz * 0.04 + (rnd(ctx) - 0.5) * 0.01) * (1 + burst);

    // damping
    vel[idx] *= 0.94 - burst * 0.03;
    vel[idx + 1] *= 0.94 - burst * 0.03;
    vel[idx + 2] *= 0.94 - burst * 0.03;

    // position
    const px = ox + nx * amp + vel[idx];
    const py = by + ny * amp + vel[idx + 1];
    const pz = oz + nz * amp + vel[idx + 2];

    pos[idx] = px;
    pos[idx + 1] = py;
    pos[idx + 2] = pz;

    // ramener doucement vers le "base"
    base[idx] += (bx - base[idx]) * pull;
    base[idx + 1] += (by - base[idx + 1]) * pull;
    base[idx + 2] += (bz - base[idx + 2]) * pull;
  }

  geom.attributes.position.needsUpdate = true;
  geom.attributes.velocity.needsUpdate = true;
}

/* --------------------- Liens dynamiques (spatial hash) --------------------- */
function hash3(x, y, z) {
  // grid hash string (simple, ok pour ~1000 particules)
  return `${x}|${y}|${z}`;
}

export function updateParticleLinks(ctx) {
  const cfg = ensureConfig(ctx);

  // NOTE: opacité des matériaux recalée ici pour suivre le mul même sans rebuild
  applyOpacityToMaterials(ctx, cfg);

  if (!ctx.particlesLinks || !ctx.particlesPoints || cfg.mode !== 'links') {
    if (ctx.particlesLinks) ctx.particlesLinks.visible = false;
    return;
  }

  // IMPORTANT: variable explicitement reliée à ctx.appliedOpacityParticlesMul
  const particlesMul = getParticlesOpacityMul(ctx);

  const pPos = ctx.particlesPoints.geometry.attributes.position.array;
  const count = pPos.length / 3;

  const linkGeom = ctx.particlesLinks.geometry;
  const lPos = linkGeom.attributes.position.array;

  const maxSegments = ctx.particlesLinks.userData.maxSegments || count * 8;
  const baseDist = cfg.linkDistance || 1.2;

  // LFO: distance varie légèrement (respiration des liens)
  const nowMs = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const lfo = 0.5 + 0.5 * Math.sin((ctx?.ritualGenome?.progress ?? 0.5) * Math.PI * 2 + nowMs * 0.0004);
  const dist = baseDist * (0.9 + lfo * 0.25);
  const maxDist2 = dist * dist;

  // Spatial hash
  const cellSize = dist;
  const buckets = new Map();

  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    const cx = Math.floor(pPos[idx] / cellSize);
    const cy = Math.floor(pPos[idx + 1] / cellSize);
    const cz = Math.floor(pPos[idx + 2] / cellSize);
    const key = hash3(cx, cy, cz);
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }

  const neighbors = [-1, 0, 1];
  let write = 0;
  const maxNeighbors = cfg.dynamics?.maxNeighbors ?? 28;

  for (let i = 0; i < count; i++) {
    const idxA = i * 3;
    const ax = pPos[idxA],
      ay = pPos[idxA + 1],
      az = pPos[idxA + 2];

    const cx = Math.floor(ax / cellSize);
    const cy = Math.floor(ay / cellSize);
    const cz = Math.floor(az / cellSize);

    let found = 0;

    for (const dx of neighbors)
      for (const dy of neighbors)
        for (const dz of neighbors) {
          const key = hash3(cx + dx, cy + dy, cz + dz);
          const list = buckets.get(key);
          if (!list) continue;

          for (let k = 0; k < list.length; k++) {
            const j = list[k];
            if (j <= i) continue;

            const idxB = j * 3;
            const bx = pPos[idxB],
              by = pPos[idxB + 1],
              bz = pPos[idxB + 2];

            const d2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
            if (d2 > maxDist2) continue;

            if (write + 6 >= lPos.length || write / 6 >= maxSegments) break;

            lPos[write++] = ax;
            lPos[write++] = ay;
            lPos[write++] = az;
            lPos[write++] = bx;
            lPos[write++] = by;
            lPos[write++] = bz;

            found++;
            if (found >= maxNeighbors) break;
          }
          if (found >= maxNeighbors) break;
        }
  }

  linkGeom.setDrawRange(0, write / 3);
  linkGeom.attributes.position.needsUpdate = true;

  // Couleur du lien: mix (color1 -> color2)
  const c = cfg.color1.clone().lerp(cfg.color2, 0.5);
  ctx.particlesLinks.material.color.copy(c);

  // opacité modulée (lente) + particlesMul (SINK: doit rester sur 1 ligne pour l'audit)
  const slow = 0.5 + 0.5 * Math.sin(nowMs * 0.0007);
  ctx.particlesLinks.material.opacity = Math.min(1, clamp01(cfg.opacity) * (0.22 + slow * 0.28)) * particlesMul;
  ctx.particlesLinks.visible = true;
}

/* ------------------------------- Trails -------------------------------- */
export function updateParticleTrails(ctx) {
  const cfg = ensureConfig(ctx);

  // NOTE: opacité des matériaux recalée ici pour suivre le mul même sans rebuild
  applyOpacityToMaterials(ctx, cfg);

  if (!ctx.particlesTrails || !ctx.particlesPoints || cfg.mode !== 'trails') {
    if (ctx.particlesTrails) ctx.particlesTrails.visible = false;
    return;
  }

  // IMPORTANT: variable explicitement reliée à ctx.appliedOpacityParticlesMul
  const particlesMul = getParticlesOpacityMul(ctx);

  const pPos = ctx.particlesPoints.geometry.attributes.position.array;
  const count = pPos.length / 3;

  // Historique: garde trailLength snapshots
  ctx.trailHistory.unshift(Float32Array.from(pPos));
  const len = cfg.trailLength || 12;
  if (ctx.trailHistory.length > len) ctx.trailHistory.pop();

  const tPos = ctx.particlesTrails.geometry.attributes.position.array;
  const tCol = ctx.particlesTrails.geometry.attributes.color.array;

  const c1 = cfg.color1;
  const c2 = cfg.color2;

  let v = 0;
  for (let h = 0; h < ctx.trailHistory.length; h++) {
    const snap = ctx.trailHistory[h];
    const alpha = Math.pow(1.0 - h / len, 2.0) * (cfg.trailFade ?? 0.9);

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      tPos[v * 3] = snap[idx];
      tPos[v * 3 + 1] = snap[idx + 1];
      tPos[v * 3 + 2] = snap[idx + 2];

      const mix = i / Math.max(1, count - 1);
      const c = c1.clone().lerp(c2, mix);
      tCol[v * 3] = c.r * alpha;
      tCol[v * 3 + 1] = c.g * alpha;
      tCol[v * 3 + 2] = c.b * alpha;

      v++;
      if (v >= tPos.length / 3) break;
    }
    if (v >= tPos.length / 3) break;
  }

  ctx.particlesTrails.geometry.setDrawRange(0, v);
  ctx.particlesTrails.geometry.attributes.position.needsUpdate = true;
  ctx.particlesTrails.geometry.attributes.color.needsUpdate = true;

  // IMPORTANT: sink opacité * particlesMul (audit-opacity-sinks)
  ctx.particlesTrails.material.opacity = clamp01(cfg.opacity) * 0.9 * particlesMul;
  ctx.particlesTrails.visible = true;
}

/* --------------------------- Config update --------------------------- */
export function setParticlesConfig(ctx, patch = {}) {
  ensureConfig(ctx);
  const prev = ctx.particlesConfig;

  // merge "dynamics"
  if (patch.dynamics) {
    patch = { ...patch, dynamics: { ...prev.dynamics, ...patch.dynamics } };
  }
  Object.assign(prev, patch);

  const cfg = ensureConfig(ctx);

  // rebuild si structure change
  const rebuildKeys = ['count', 'distribution'];
  const mustRebuild = patch.forceRebuild || rebuildKeys.some((k) => k in patch) || !ctx.particlesPoints;

  if (mustRebuild) {
    createInnerParticles(ctx);
    return cfg;
  }

  // update matériaux (en appliquant le mul)
  applyOpacityToMaterials(ctx, cfg);

  if (ctx.particlesPoints?.material) {
    ctx.particlesPoints.material.size = cfg.size;
    ctx.particlesPoints.material.needsUpdate = true;
  }
  if (ctx.particlesTrails?.material) {
    ctx.particlesTrails.material.size = cfg.size * 0.75;
    ctx.particlesTrails.material.needsUpdate = true;
  }
  if (ctx.particlesLinks?.material) {
    // opacité "par défaut" quand links n'est pas actif (quand actif, updateParticleLinks gère dynamique)
    if (cfg.mode !== 'links') {
      const particlesMul = getParticlesOpacityMul(ctx);
      ctx.particlesLinks.material.opacity = Math.min(1, clamp01(cfg.opacity) * 0.45) * particlesMul;
    }
    ctx.particlesLinks.material.needsUpdate = true;
  }

  return cfg;
}
