import * as THREE from 'three';
import { OrbAuditBridge } from './audit/OrbAuditBridge.ts';
import * as orbFluidParticles from './modules/orbFluidParticles.js';
import * as orbGeometry from './modules/orbGeometry.js';
import * as orbGround from './modules/orbGround.js';
import * as orbLighting from './modules/orbLighting.js';
import * as orbParticles from './modules/orbParticles.js';
import * as orbPoly from './modules/orbPoly.js';
import * as orbVolumes from './modules/orbVolumes.js';
import { ClimateController } from './params/ClimateController';
import { applyMaterials } from './render/materials/applyMaterials';
import { mapClimateToRenderParams } from './render/materials/mapClimateToRenderParams';

/**
 * RitualOrchestrator — version "Ultime"
 * Objectifs:
 * - Variabilité énorme mais contrôlée (pas de lumière extrême)
 * - Interdépendance subtile entre modules via ctx.ritualGenome
 * - Wireframes en couches vivantes + particules "liaisons" lentes et "burst" rapides
 * - Déterminisme optionnel (seed) + unicité par défaut
 * - Émission des invariants runtime vers la CI (OrbAuditBridge)
 */

/* -------------------------- RNG déterministe -------------------------- */
function cyrb128(str) {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function makeRng(seedString) {
  const seed = cyrb128(seedString);
  const rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
  return {
    seedString,
    random: () => rand(),
    float: (min, max) => min + (max - min) * rand(),
    int: (min, max) => Math.floor(min + (max - min + 1) * rand()),
    bool: (p = 0.5) => rand() < p,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    sign: () => (rand() < 0.5 ? -1 : 1),
    smooth01: (t, freq = 1) => 0.5 + 0.5 * Math.sin(t * freq),
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
function smoothstep01(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp((Number(x) - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function normalizeClampValue(candidate, fallback = null) {
  if (typeof candidate === 'number' && Number.isFinite(candidate))
    return candidate;
  if (!candidate || typeof candidate !== 'object') return fallback;

  const min =
    typeof candidate.min === 'number' && Number.isFinite(candidate.min)
      ? candidate.min
      : null;

  const max =
    typeof candidate.max === 'number' && Number.isFinite(candidate.max)
      ? candidate.max
      : null;

  if (min !== null && max !== null) return Math.min(min, max);
  if (max !== null) return max;
  if (min !== null) return min;

  return fallback;
}

function hashToUnit(input) {
  if (!input || typeof input !== 'string') return 0.5;
  const seed = input.trim();
  if (!seed) return 0.5;
  const [a, b, c, d] = cyrb128(seed);
  const r = sfc32(a, b, c, d);
  return r();
}

function isDev() {
  try {
    return !!import.meta?.env?.DEV;
  } catch {
    return false;
  }
}

function isFn(value) {
  return typeof value === 'function';
}

function buildVolumeSafe(ctx) {
  if (isFn(orbVolumes.buildVolume)) {
    return orbVolumes.buildVolume(ctx);
  }
  if (isFn(orbVolumes.setVolumeConfig)) {
    return orbVolumes.setVolumeConfig(ctx, { forceRebuild: true });
  }
  if (isFn(orbVolumes.ensureVolumeConfig)) {
    orbVolumes.ensureVolumeConfig(ctx);
  }
  return null;
}

function updateVolumeSafe(ctx, time = 0) {
  if (isFn(orbVolumes.updateVolumeForFrame)) {
    return orbVolumes.updateVolumeForFrame(ctx, time);
  }
  return null;
}

function setVolumeConfigSafe(ctx, patch = {}) {
  if (isFn(orbVolumes.setVolumeConfig)) {
    return orbVolumes.setVolumeConfig(ctx, patch);
  }
  if (isFn(orbVolumes.ensureVolumeConfig)) {
    const cfg = orbVolumes.ensureVolumeConfig(ctx);
    if (patch && typeof patch === 'object') {
      Object.assign(cfg, patch);
    }
    return cfg;
  }
  return ctx?.volumeConfig ?? null;
}

function ensureVolumeConfigSafe(ctx) {
  if (isFn(orbVolumes.ensureVolumeConfig)) {
    return orbVolumes.ensureVolumeConfig(ctx);
  }
  return ctx?.volumeConfig ?? null;
}

const SHAPE_POOL_LOW = ['tetra', 'octa', 'box', 'cone'];
const SHAPE_POOL_MID = ['icosa', 'dodeca', 'sphere', 'capsule', 'torus'];
const SHAPE_POOL_HIGH = [
  'torusKnot',
  'octaDetail',
  'knotComplex',
  'torus',
  'torusKnot',
];

const PALETTE_MODES = ['mono', 'complement', 'split', 'triad', 'analog'];
const MOTION_SIGNATURES = ['calm', 'breath', 'link', 'storm', 'burst'];

export class RitualOrchestrator {
  constructor(ctx) {
    this.ctx = ctx;
    this.mood = 'Default';
    this.progress = 0;
    this.lastTime = 0;

    this.baseRadius = Math.max(ctx?.orbShellConfig?.radius ?? 2.35, 2.35);
    this.baseYOffset = ctx?.orbGroup?.position?.y ?? 0;

    this.hatchPulse = 0;
    this.revealActive = false;
    this.flashTimer = 0;

    this.foregroundMesh = null;
    this.llmParams = null;
    this.textLength = 0;
    this.textMetrics = null;
    this.lastLayoutLog = 0;
    this._renderMapOpts = { dt: 0, smoothing: { enabled: true, tauMs: 200 } };

    this.motion = { mode: 'calm', phase: 0, energy: 0.25, lastSwitch: 0 };
    this.lastParticleModeChange = 0;
    this.particleModeChanges = 0;
    this._climateWireOpacityMul = 1.0;
    this._climateParticlesOpacityMul = 1.0;
    this._climateForegroundOpacity = null;

    this.lastInputs = {};

    this.rng = makeRng(`ritual-default-${Date.now()}-${Math.random()}`);

    this.ritualDNA = {
      seed: this.rng.seedString,
      path: { p0: 'tetra', p1: 'icosa', p2: 'torusKnot' },
      texture: 'smooth',
      paletteMode: 'analog',
      noiseScale: 1.0,
      noiseSpeed: 1.0,
      particleStyle: 'shell',
    };

    this.currentState = {
      orbScale: 0.18,
      orbYOffset: 0,
      orbZOffset: 0,

      lightKey: 0.35,
      lightFill: 0.18,
      rim: 0.08,

      deformBase: 0.0,
      deformPulse: 0.0,
      dislocation: 0.0,
      turbulence: 0.0,

      spinSpeed: 0.0,
      wobble: 0.0,

      wireOpacity: 0.22,
      backgroundStrength: 0.18,
      glowIntensity: 0.18,
      glowSize: 1.0,
      softness: 0.62,

      foregroundOpacity: 0.08,

      lightColor: new THREE.Color(0x9bb4ff),
      bgColor: new THREE.Color(0x182235),
      wireColor: new THREE.Color(0xe5eeff),
    };
    this.targetState = { ...this.currentState };
    this.visualState = { shape: 'tetra', detail: 0 };
    this.visualTarget = { shape: 'tetra', detail: 0 };
  }

  initRitual(userName = '', options = {}) {
    const explicitSeed = options?.seed ? String(options.seed) : null;
    const seedString =
      explicitSeed ??
      `${String(userName || 'Anonyme')}-${Date.now()}-${Math.random()}`;
    this.rng = makeRng(seedString);

    const textureType = this.rng.random();
    const paletteMode = this.rng.pick(PALETTE_MODES);
    const signature = this.rng.pick(MOTION_SIGNATURES);

    this.ritualDNA = {
      seed: seedString,
      path: {
        p0: this.rng.pick(SHAPE_POOL_LOW),
        p1: this.rng.pick(SHAPE_POOL_MID),
        p2: this.rng.pick(SHAPE_POOL_HIGH),
      },
      texture:
        textureType < 0.33
          ? 'smooth'
          : textureType < 0.66
            ? 'jagged'
            : 'liquid',
      paletteMode,
      noiseScale: this.rng.float(0.55, 2.1),
      noiseSpeed: this.rng.float(0.55, 1.6),
      particleStyle: this.rng.bool(0.55) ? 'shell' : 'volume',
      signature,
    };

    this.llmParams = null;
    this.textLength = 0;
    this.textMetrics = null;
    this.lastInputs = {};
    this.revealActive = false;
    this.flashTimer = 0;
    this.hatchPulse = 0;
    this.lastLayoutLog = 0;

    this.ctx.climateController = new ClimateController({
      seed: this.ritualDNA.seed,
      debug: import.meta.env?.DEV,
    });
    this.ctx.climateController.setMood(this.mood);
    this.ctx.climateController.setVisualParams(this.llmParams);
    this.ctx.climateTargets = null;

    this.ctx.ritualGenome = this._buildGenome({ progress: 0, payload: null });

    this.ctx.orbShellConfig = this.ctx.orbShellConfig || {};
    this.ctx.orbShellConfig.radius = Math.max(this.baseRadius, 2.35);

    this.ctx.orbShellConfig.shapeType = this.ritualDNA.path.p0;
    this.ctx.orbShellConfig.detail = 2;

    orbGeometry.setRitualConfig?.(this.ctx, this.ctx.ritualGenome);
    orbGeometry.createPolyhedron(this.ctx);

    this.ctx.lightConfig = { dirIntensity: 0, hemiIntensity: 0 };
    orbLighting.initDefaultLights(this.ctx);

    orbGround?.buildGround?.(this.ctx);
    buildVolumeSafe(this.ctx);

    orbPoly.setPolyConfig?.(this.ctx, { enabled: false });
    orbFluidParticles.setFluidParticlesConfig?.(this.ctx, { enabled: false });

    if (!this.foregroundMesh) {
      const fgGeo = new THREE.PlaneGeometry(20, 20);
      const fgMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.foregroundMesh = new THREE.Mesh(fgGeo, fgMat);
      this.foregroundMesh.position.z = 4.0;
      this.foregroundMesh.renderOrder = 10;
      this.ctx.scene.add(this.foregroundMesh);
    } else {
      this.foregroundMesh.material.color.setHex(0x05070a);
      this.foregroundMesh.material.setValues({ opacity: 0.08 });

      this.ctx.appliedOpacityForeground =
        typeof this._climateForegroundOpacity === 'number'
          ? this._climateForegroundOpacity
          : null;
    }

    orbParticles.setParticlesConfig?.(this.ctx, { enabled: false });

    Object.assign(this.currentState, {
      orbScale: 0.42,
      lightKey: 0.55,
      lightFill: 0.24,
      rim: 0.12,
      glowIntensity: 0.22,
      backgroundStrength: 0.18,
      softness: 0.62,
      wireOpacity: 0.28,
      foregroundOpacity: 0.08,
    });
    this.currentState.lightColor.setHex(0xa8b8ff);
    this.currentState.bgColor.setHex(0x172235);
    this.currentState.wireColor.setHex(0xf0f5ff);

    this.updateState(0, {});
  }

  setMood(moodName) {
    this.mood = moodName || 'Default';
    this.ctx.climateController?.setMood(this.mood);
    this.updateState(this.progress, this.lastInputs);
  }

  setRitualData(payload = {}) {
    if (payload.mood) this.mood = payload.mood;
    if (payload.mood) this.ctx.climateController?.setMood(this.mood);

    if (payload.visualParams) {
      this.llmParams = payload.visualParams;
      this.hatchPulse = 0.55;
      this.ctx.climateController?.setVisualParams(this.llmParams);
    }

    if (payload.textLength) this.textLength = payload.textLength;

    if (payload.textMetrics) {
      this.textMetrics = payload.textMetrics;
      const now =
        typeof performance !== 'undefined' && performance.now
          ? performance.now()
          : Date.now();
      if (isDev() && (!this.lastLayoutLog || now - this.lastLayoutLog > 1500)) {
        this.lastLayoutLog = now;
      }
    }

    if (payload.seed && typeof payload.seed === 'string') {
      this.rng = makeRng(payload.seed);
      this.ritualDNA.seed = payload.seed;
      this.ctx.climateController?.setSeed(payload.seed);
    }

    this.lastInputs = { ...this.lastInputs, ...payload };
    this.updateState(this.progress, this.lastInputs);
  }

  _buildGenome({ progress, payload }) {
    const p = clamp01(progress);
    const data = payload || {};

    const fearSig = hashToUnit(data.fear);
    const desireSig = hashToUnit(data.desire);
    const chaosLLM = clamp01(this.llmParams?.chaos ?? 0.35);

    const textureFactor =
      this.ritualDNA.texture === 'jagged'
        ? 1.15
        : this.ritualDNA.texture === 'liquid'
          ? 1.05
          : 0.95;

    const chaos = clamp01(chaosLLM * textureFactor);

    const baseHue = this.llmParams?.primary_color
      ? new THREE.Color(this.llmParams.primary_color).getHSL({
          h: 0,
          s: 0,
          l: 0,
        }).h
      : data.fear
        ? fearSig * 0.08
        : 0.55 + desireSig * 0.18;

    const sat = 0.45 + chaos * 0.35;
    const lum = 0.46 + 0.12 * (1 - chaos);
    const primary = new THREE.Color().setHSL(baseHue, sat, lum);

    const paletteMode = this.ritualDNA.paletteMode;
    const hueShift = (x) => ((x % 1) + 1) % 1;

    const palette = (() => {
      if (paletteMode === 'mono')
        return {
          primary,
          secondary: primary.clone().offsetHSL(0, -0.08, 0.08),
          accent: primary.clone().offsetHSL(0, 0.08, -0.06),
        };
      if (paletteMode === 'complement')
        return {
          primary,
          secondary: new THREE.Color().setHSL(
            hueShift(baseHue + 0.5),
            sat * 0.9,
            lum,
          ),
          accent: primary.clone().offsetHSL(0.08, 0.1, 0.06),
        };
      if (paletteMode === 'split')
        return {
          primary,
          secondary: new THREE.Color().setHSL(
            hueShift(baseHue + 0.45),
            sat * 0.9,
            lum,
          ),
          accent: new THREE.Color().setHSL(
            hueShift(baseHue + 0.55),
            sat * 0.9,
            lum,
          ),
        };
      if (paletteMode === 'triad')
        return {
          primary,
          secondary: new THREE.Color().setHSL(
            hueShift(baseHue + 1 / 3),
            sat * 0.85,
            lum,
          ),
          accent: new THREE.Color().setHSL(
            hueShift(baseHue + 2 / 3),
            sat * 0.85,
            lum,
          ),
        };
      return {
        primary,
        secondary: new THREE.Color().setHSL(
          hueShift(baseHue + 0.06),
          sat * 0.95,
          lum,
        ),
        accent: new THREE.Color().setHSL(
          hueShift(baseHue - 0.06),
          sat * 0.95,
          lum,
        ),
      };
    })();

    const wireLayers = this.rng.int(2, 6);
    const wireSpacing = this.rng.float(0.035, 0.085);
    const wireBreath = this.rng.float(0.15, 0.35);

    const signature = this.ritualDNA.signature;
    const motion = {
      signature,
      energy: THREE.MathUtils.clamp(0.18 + chaos * 0.62 + p * 0.22, 0.12, 0.95),
      linkBias: THREE.MathUtils.clamp(
        0.45 + (signature === 'link' ? 0.25 : 0) - chaos * 0.15,
        0.15,
        0.85,
      ),
      burstBias: THREE.MathUtils.clamp(
        0.18 + (signature === 'burst' ? 0.35 : 0) + chaos * 0.25,
        0.1,
        0.85,
      ),
    };

    const density = THREE.MathUtils.clamp(
      0.35 + chaos * 0.6 + (signature === 'storm' ? 0.15 : 0),
      0.2,
      1.0,
    );
    const particleCount = Math.floor(180 + density * 820);
    const particleSize = this.rng.float(0.06, 0.18) * (0.9 + chaos * 0.35);
    const linkDistance = this.rng.float(0.85, 1.6) * (1.1 - chaos * 0.35);

    const volume = {
      enabled: true,
      backgroundColor: palette.primary.clone().multiplyScalar(0.14),
      glowColor: palette.primary.clone().lerp(new THREE.Color(0xffffff), 0.18),
      glowIntensity: THREE.MathUtils.clamp(
        0.42 + p * 0.28 + chaos * 0.18,
        0.32,
        1.0,
      ),
      backgroundStrength: THREE.MathUtils.clamp(
        0.18 + p * 0.16 + chaos * 0.08,
        0.14,
        0.48,
      ),
      softness: THREE.MathUtils.clamp(
        0.58 - p * 0.28 + chaos * 0.16,
        0.2,
        0.82,
      ),
      noise: {
        scale: this.rng.float(2.4, 6.8),
        speed: this.rng.float(0.08, 0.28) * (0.8 + chaos),
        amount: this.rng.float(0.06, 0.18) * (0.8 + chaos),
      },
    };

    const lighting = {
      key: THREE.MathUtils.clamp(0.72 + p * 1.05 + chaos * 0.22, 0.55, 2.1),
      fill: THREE.MathUtils.clamp(0.26 + p * 0.42, 0.22, 1.05),
      rim: THREE.MathUtils.clamp(
        0.14 + chaos * 0.2 + (p > 0.8 ? 0.08 : 0),
        0.1,
        0.78,
      ),
      warmth: this.rng.float(-0.05, 0.08),
      drift: this.rng.float(0.12, 0.28),
    };

    const geometry = {
      baseDeform: THREE.MathUtils.clamp(
        0.02 + p * 0.22 + chaos * 0.16,
        0.0,
        0.45,
      ),
      pulseDeform: THREE.MathUtils.clamp(
        0.02 + p * 0.16 + chaos * 0.18,
        0.0,
        0.45,
      ),
      dislocation: THREE.MathUtils.clamp(0.0 + chaos * 0.08, 0.0, 0.18),
      turbulence: THREE.MathUtils.clamp(
        0.08 + chaos * 0.55 + p * 0.25,
        0.05,
        0.95,
      ),
      noise: {
        f1: this.ritualDNA.noiseScale,
        f2: this.ritualDNA.noiseScale * (1.25 + chaos * 0.4),
        f3: this.ritualDNA.noiseScale * (1.9 + chaos * 0.6),
      },
      wire: {
        layers: wireLayers,
        spacing: wireSpacing,
        breath: wireBreath,
        opacityBase: THREE.MathUtils.clamp(0.12 + p * 0.6, 0.08, 0.95),
        opacityInner: THREE.MathUtils.clamp(0.06 + p * 0.25, 0.03, 0.55),
      },
      colors: {
        solid: palette.primary.clone().multiplyScalar(0.35),
        wire: palette.primary.clone().offsetHSL(0, 0.05, 0.22),
      },
    };

    const particles = {
      enabled: p > 0.12,
      count: particleCount,
      size: particleSize,
      opacity: THREE.MathUtils.clamp(0.35 + p * 0.4, 0.22, 0.85),
      color1: palette.primary.clone(),
      color2: palette.accent.clone(),
      radiusFactor: THREE.MathUtils.clamp(1.1 + p * 0.55, 1.1, 1.9),
      distribution:
        this.ritualDNA.particleStyle === 'volume' ? 'volume' : 'shell',
      linkDistance,
      trailLength: Math.floor(10 + p * 14 + chaos * 8),
      trailFade: THREE.MathUtils.clamp(0.86 + chaos * 0.08, 0.84, 0.96),
      dynamics: {
        lfoSpeed: this.rng.float(0.08, 0.22) * (0.8 + chaos),
        linkBias: motion.linkBias,
        burstBias: motion.burstBias,
        maxNeighbors: Math.floor(18 + density * 24),
      },
    };

    const poly = {
      enabled: p > 0.45 && this.rng.bool(0.65),
      wireframe: true,
      subsampling: THREE.MathUtils.clamp(0.35 + (1 - chaos) * 0.35, 0.18, 0.85),
      noiseAmplitude: THREE.MathUtils.clamp(0.02 + chaos * 0.12, 0.0, 0.24),
      noiseFrequency: THREE.MathUtils.clamp(0.6 + chaos * 1.4, 0.4, 2.6),
      dislocation: THREE.MathUtils.clamp(0.0 + chaos * 0.06, 0.0, 0.14),
      color: palette.secondary.clone(),
      emissive: palette.primary.clone().multiplyScalar(0.05),
      thickness: THREE.MathUtils.clamp(0.35 + (1 - chaos) * 0.45, 0.15, 0.9),
      lineWidth: 1,
      mode: this.rng.bool(0.55) ? 'torusKnot' : 'polyhedron',
      radius: this.rng.float(0.5, 0.9),
      tube: this.rng.float(0.12, 0.26),
      p: this.rng.int(2, 4),
      q: this.rng.int(3, 6),
      tubularSegments: this.rng.int(90, 190),
      radialSegments: this.rng.int(10, 18),
      polyDetail: this.rng.int(0, 2),
      flipFaces: this.rng.bool(0.2),
    };

    const fluid = {
      enabled: p > 0.65 && this.rng.bool(0.7),
      maxCount: Math.floor(240 + density * 520),
      size: this.rng.float(0.03, 0.075) * (0.9 + chaos * 0.3),
      flowMode: this.rng.pick(['stream', 'vortex', 'suction', 'burst', 'curl']),
      flowStrength: THREE.MathUtils.clamp(
        0.6 + chaos * 1.2 + p * 0.35,
        0.35,
        2.2,
      ),
      spawnRate: Math.floor(25 + density * 120),
      lifetime: THREE.MathUtils.clamp(2.2 + (1 - chaos) * 2.2, 1.2, 5.5),
      speed: THREE.MathUtils.clamp(0.75 + chaos * 1.35, 0.45, 2.6),
      spread: THREE.MathUtils.clamp(0.25 + density * 0.8, 0.2, 1.4),
      noise: THREE.MathUtils.clamp(0.1 + chaos * 0.85, 0.05, 1.2),
      gravity: -THREE.MathUtils.clamp(0.15 + (1 - chaos) * 0.8, 0.05, 0.9),
      colorStart: palette.primary.clone(),
      colorEnd: palette.accent.clone(),
      burstInterval: THREE.MathUtils.clamp(3.2 - chaos * 1.6, 1.4, 4.2),
    };

    return {
      seed: this.ritualDNA.seed,
      mood: this.mood,
      progress: p,
      chaos,
      paletteMode,
      palette,
      motion,
      geometry,
      lighting,
      particles,
      volume,
      poly,
      fluid,
      rng: this.rng,
    };
  }

  updateState(progress, payload = this.lastInputs) {
    this.progress = clamp01(progress);
    const p = this.progress;
    const data = payload || {};
    const reveal = p > 0.9;

    const genome = this._buildGenome({ progress: p, payload: data });
    this.ctx.ritualGenome = genome;

    const baseColor = genome.palette.primary;
    this.targetState.lightColor.copy(baseColor);
    this.targetState.bgColor.copy(genome.volume.backgroundColor);
    this.targetState.wireColor.copy(genome.geometry.colors.wire);

    if (p < 0.15)
      this.visualTarget = { shape: this.ritualDNA.path.p0, detail: 0 };
    else if (p < 0.5)
      this.visualTarget = { shape: this.ritualDNA.path.p1, detail: 1 };
    else if (p < 0.85)
      this.visualTarget = { shape: this.ritualDNA.path.p2, detail: 2 };
    else {
      const finalShape =
        this.llmParams?.shape_archetype || this.ritualDNA.path.p2;
      this.visualTarget = { shape: finalShape, detail: 4 };
      if (reveal && !this.revealActive) {
        this.revealActive = true;
        this.flashTimer = 0.7;
      }
    }

    this.targetState.orbScale = p < 0.12 ? 0.96 : p < 0.5 ? 1.12 : 1.18;
    this.targetState.wireOpacity = genome.geometry.wire.opacityBase;
    this.targetState.softness = genome.volume.softness;
    this.targetState.backgroundStrength = genome.volume.backgroundStrength;
    this.targetState.glowIntensity = genome.volume.glowIntensity;

    const tm = this.textMetrics;
    const areaRatio = tm?.areaRatio ?? 0;
    const linesApprox = tm?.linesApprox ?? 1;
    const viewportW = tm?.viewportW ?? 1200;
    const mobileFactor = viewportW < 900 ? 1.15 : 1.0;
    const layoutPressure = clamp01(
      (areaRatio * 1.2 + linesApprox / 30) * mobileFactor,
    );

    this.targetState.lightKey = genome.lighting.key;
    this.targetState.lightFill = genome.lighting.fill;
    this.targetState.rim = genome.lighting.rim;

    this.targetState.deformBase = genome.geometry.baseDeform;
    this.targetState.deformPulse = genome.geometry.pulseDeform;
    this.targetState.dislocation = genome.geometry.dislocation;
    this.targetState.turbulence = genome.geometry.turbulence;

    this.targetState.spinSpeed = 0.06 + genome.motion.energy * 0.22;
    this.targetState.wobble = 0.05 + genome.motion.energy * 0.18;

    orbParticles.setParticlesConfig?.(this.ctx, {
      enabled: genome.particles.enabled,
      count: genome.particles.count,
      size: genome.particles.size,
      opacity: genome.particles.opacity,
      color1: genome.particles.color1,
      color2: genome.particles.color2,
      radiusFactor: genome.particles.radiusFactor,
      distribution: genome.particles.distribution,
      linkDistance: genome.particles.linkDistance,
      trailLength: genome.particles.trailLength,
      trailFade: genome.particles.trailFade,
      dynamics: genome.particles.dynamics,
      mode: p < 0.35 ? 'points' : p < 0.7 ? 'links' : 'trails',
    });

    setVolumeConfigSafe(this.ctx, {
      enabled: genome.volume.enabled,
      backgroundColor: genome.volume.backgroundColor,
      backgroundStrength: genome.volume.backgroundStrength,
      glowColor: genome.palette.primary,
      glowIntensity: genome.volume.glowIntensity,
      softness: genome.volume.softness,
      noise: genome.volume.noise,
      vignette: 1.05,
      glowPulseSpeed: 0.45 + genome.chaos * 0.55,
      glowPulseAmp: 0.03 + genome.chaos * 0.08,
    });

    orbGeometry.setRitualConfig?.(this.ctx, genome);

    orbPoly.setPolyConfig?.(this.ctx, {
      ...genome.poly,
      enabled: genome.poly.enabled,
    });

    orbFluidParticles.setFluidParticlesConfig?.(this.ctx, {
      enabled: genome.fluid.enabled,
      maxCount: genome.fluid.maxCount,
      size: genome.fluid.size,
      flowMode: genome.fluid.flowMode,
      flowStrength: genome.fluid.flowStrength,
      spawnRate: genome.fluid.spawnRate,
      lifetime: genome.fluid.lifetime,
      speed: genome.fluid.speed,
      spread: genome.fluid.spread,
      noise: genome.fluid.noise,
      gravity: genome.fluid.gravity,
      colorStart: genome.fluid.colorStart,
      colorEnd: genome.fluid.colorEnd,
      burstInterval: genome.fluid.burstInterval,
      flowCenter: { x: 0, y: 0, z: 0 },
      flowDirection: { x: 0, y: 1, z: 0 },
    });

    const textRatio = Math.min(1.0, (this.textLength || 0) / 520);
    const pressScale = clamp01(layoutPressure);
    const baseScale = this.targetState.orbScale * (1 - pressScale * 0.18);
    const baseYOffset = (this.targetState.orbYOffset || 0) + pressScale * 0.42;
    const baseZOffset = (this.targetState.orbZOffset || 0) - pressScale * 0.78;

    if (reveal) {
      this.targetState.orbScale = Math.min(
        1.12,
        Math.max(0.62, 0.82 - textRatio * 0.08 - pressScale * 0.12),
      );
      this.targetState.orbYOffset =
        0.42 + textRatio * 0.22 + baseYOffset * 0.35;
      this.targetState.orbZOffset =
        -1.05 - textRatio * 0.42 + baseZOffset * 0.32;
    } else {
      this.targetState.orbScale = Math.min(1.12, Math.max(0.62, baseScale));
      this.targetState.orbYOffset = baseYOffset;
      this.targetState.orbZOffset = baseZOffset;
    }

    this.targetState.foregroundOpacity = p < 0.12 ? 0.08 : p < 0.4 ? 0.03 : 0.0;

    this.updateVisuals();
  }

  updateVisuals() {
    const t = this.visualTarget;
    if (
      this.visualState.shape !== t.shape ||
      this.visualState.detail !== t.detail
    ) {
      orbGeometry.setShapeType(this.ctx, t.shape);
      orbGeometry.setPolyDetail(this.ctx, t.detail);
      this.visualState.shape = t.shape;
      this.visualState.detail = t.detail;
      this.hatchPulse = 1.0;
    }
  }

  applyTargetsToRuntime(ctx, targets, safetyFactor = 1, bloomClamp = null) {
    if (!ctx) return;

    const emergency = !!ctx?.runtimeFlags?.emergencyMode;

    const safeFactor = Number.isFinite(safetyFactor)
      ? clamp01(safetyFactor)
      : 1.0;

    const opacity = targets?.opacity;
    const wireOpacityMul =
      typeof opacity?.wireOpacityMul === 'number'
        ? opacity.wireOpacityMul
        : 1.0;
    const particlesOpacityMul =
      typeof opacity?.particlesOpacityMul === 'number'
        ? opacity.particlesOpacityMul
        : 1.0;
    const rawForegroundOpacity =
      typeof opacity?.foregroundOpacity === 'number'
        ? opacity.foregroundOpacity
        : null;

    const tm = this.textMetrics;
    const layoutPressure = clamp01(
      (tm?.areaRatio ?? 0) * 1.15 + (tm?.linesApprox ?? 1) / 30,
    );
    const finalPhase = smoothstep01(0.86, 1.0, this.progress || 0);
    const readabilityLift = clamp01(layoutPressure * 0.8 + finalPhase * 0.5);

    const foregroundOpacity =
      rawForegroundOpacity == null
        ? null
        : rawForegroundOpacity * (1 - readabilityLift * 0.72);

    this._climateWireOpacityMul = wireOpacityMul;
    this._climateParticlesOpacityMul = particlesOpacityMul;
    this._climateForegroundOpacity = foregroundOpacity;

    ctx.appliedOpacityWireMul = wireOpacityMul;
    ctx.appliedOpacityParticlesMul = this._climateParticlesOpacityMul;
    ctx.appliedOpacityForeground = foregroundOpacity;
    ctx.appliedSafetyFactor = safeFactor;

    if (ctx.scene) {
      if (emergency) {
        ctx.scene.background = new THREE.Color(0x5d6f8f);
        ctx.scene.fog = null;
        ctx.appliedFogDensity = 0;
      } else {
        const fog = targets?.fog;
        if (fog?.enabled) {
          let sceneFog = ctx.scene.fog;
          if (!sceneFog || !sceneFog.isFogExp2) {
            if (!ctx._fogExp2) {
              const fogColor = fog.color != null ? fog.color : 0x000000;
              const fogDensity =
                typeof fog.density === 'number' ? fog.density : 0.02;
              ctx._fogExp2 = new THREE.FogExp2(fogColor, fogDensity);
            }
            ctx.scene.fog = ctx._fogExp2;
            sceneFog = ctx.scene.fog;
          }
          if (sceneFog?.isFogExp2 && typeof fog.density === 'number') {
            sceneFog.density = fog.density * (1 - readabilityLift * 0.55);
          }
          if (fog.color != null && sceneFog?.color?.set) {
            sceneFog.color.set(fog.color);
          }
          ctx.appliedFogDensity = sceneFog?.density ?? null;
        } else if (ctx.scene.fog?.isFogExp2) {
          ctx.scene.fog.density = 0;
          ctx.appliedFogDensity = 0;
        } else {
          ctx.appliedFogDensity = null;
        }
      }
    }

    const clampCfg =
      bloomClamp && typeof bloomClamp === 'object' ? bloomClamp : null;

    if (ctx.bloomPass) {
      const b = targets?.bloom;

      let nextStrength = null;
      if (typeof b?.strength === 'number') {
        nextStrength = b.strength * safeFactor;
      }
      nextStrength = normalizeClampValue(clampCfg?.strength, nextStrength);
      if (typeof nextStrength === 'number') {
        ctx.bloomPass.strength = nextStrength;
      }

      let nextRadius = null;
      if (typeof b?.radius === 'number') {
        nextRadius = b.radius;
      }
      nextRadius = normalizeClampValue(clampCfg?.radius, nextRadius);
      if (typeof nextRadius === 'number') {
        ctx.bloomPass.radius = nextRadius;
      }

      let nextThreshold = null;
      if (typeof b?.threshold === 'number') {
        nextThreshold = b.threshold;
      }
      nextThreshold = normalizeClampValue(clampCfg?.threshold, nextThreshold);
      if (typeof nextThreshold === 'number') {
        ctx.bloomPass.threshold = nextThreshold;
      }

      ctx.appliedBloomStrength = ctx.bloomPass.strength ?? null;
    } else {
      ctx.appliedBloomStrength = null;
    }

    const volumeCfg = ctx.volumeConfig;
    if (volumeCfg && targets?.volume) {
      const v = targets.volume;
      const s = this.currentState;
      const glowBase =
        typeof v.glowIntensity === 'number' ? v.glowIntensity : s.glowIntensity;
      const backgroundBase =
        typeof v.backgroundStrength === 'number'
          ? v.backgroundStrength
          : s.backgroundStrength;

      volumeCfg.glowIntensity =
        glowBase * safeFactor * (1 + readabilityLift * 0.24);
      volumeCfg.backgroundStrength =
        backgroundBase * safeFactor * (1 - readabilityLift * 0.42);
      volumeCfg.softness =
        typeof v.softness === 'number'
          ? Math.max(v.softness, 0.22)
          : s.softness;
      volumeCfg.vignette =
        typeof v.vignette === 'number'
          ? v.vignette
          : (volumeCfg.vignette ?? 1.05);
      volumeCfg.backgroundColor = v.bgColor != null ? v.bgColor : s.bgColor;
      volumeCfg.glowColor = v.glowColor != null ? v.glowColor : s.lightColor;

      const vignette = volumeCfg.vignette;
      if (typeof vignette === 'number') {
        const vp = ctx.vignettePass;
        if (vp?.uniforms?.vignette) vp.uniforms.vignette.value = vignette;
        else if (vp?.uniforms?.strength) vp.uniforms.strength.value = vignette;
        else if (vp?.material?.uniforms?.uVignette)
          vp.material.uniforms.uVignette.value = vignette;
      }

      ctx.appliedVignette = typeof vignette === 'number' ? vignette : null;
    } else {
      ctx.appliedVignette = null;
    }
  }

  _updateMotionMode(time, dt) {
    const g = this.ctx.ritualGenome;
    if (!g) return;

    const prog = this.progress || 0;
    const now = time;
    const margin = 0.02;
    const minHold = 12;

    let desired = 'points';
    if (prog >= 0.75 + margin) desired = 'trails';
    else if (prog >= 0.4 + margin) desired = 'links';

    const currentMode = this.ctx.particlesConfig?.mode || 'points';
    const lastChange = this.lastParticleModeChange || 0;
    const canChange = now - lastChange > minHold;

    if (desired !== currentMode && canChange) {
      orbParticles.setParticlesConfig?.(this.ctx, {
        mode: desired,
        opacity: g.particles.opacity || 0.6,
      });
      this.lastParticleModeChange = now;
      this.particleModeChanges += 1;
    } else {
      const lfo =
        0.5 +
        0.5 *
          Math.sin(
            time * (g.particles.dynamics?.lfoSpeed || 0.1) * Math.PI * 2,
          );
      const burst = lfo > 0.85 && prog > 0.75;
      orbParticles.setParticlesConfig?.(this.ctx, {
        dynamics: {
          ...g.particles.dynamics,
          burst,
        },
        linkDistance:
          (g.particles.linkDistance || 1.0) * (1 + (lfo - 0.5) * 0.15),
        opacity: (g.particles.opacity || 0.6) * (1 + (lfo - 0.5) * 0.1),
      });
    }
  }

  update(time = 0) {
    const dt = Math.min(0.05, Math.max(0.001, time - (this.lastTime || time)));
    this.lastTime = time;

    const dtMs = dt * 1000;

    if (this.ctx.climateController) {
      this.ctx.climateController.setProgress(this.progress);
      this.ctx.climateController.update(dtMs);
      this.ctx.climateTargets = this.ctx.climateController.getTargets();
    }

    const s = this.currentState;
    const t = this.targetState;
    const g = this.ctx.ritualGenome;

    let flashAdd = 0;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      flashAdd = Math.min(0.65, this.flashTimer * 0.85);
    }

    if (this.hatchPulse > 0.01) this.hatchPulse *= 1.0 - dt * 3.2;
    else this.hatchPulse = 0;

    const smooth = 3.2;
    for (const k in s) {
      if (typeof s[k] === 'number') s[k] = damp(s[k], t[k], smooth, dt);
    }
    s.lightColor.lerp(t.lightColor, dt * 2.0);
    s.bgColor.lerp(t.bgColor, dt * 2.0);
    s.wireColor.lerp(t.wireColor, dt * 2.0);

    const volumeCfg = ensureVolumeConfigSafe(this.ctx);
    this.applyTargetsToRuntime(this.ctx, this.ctx.climateTargets);

    this._updateMotionMode(time, dt);

    if (this.ctx.orbGroup && g) {
      const breath = Math.sin(time * (0.8 + g.motion.energy * 1.2)) * 0.025;
      const heart =
        Math.sin(time * (1.6 + g.motion.energy * 1.8)) *
        (0.02 + s.turbulence * 0.06);

      const scalePulse = 1 + this.hatchPulse * 0.18 + heart * 0.18;
      this.ctx.orbGroup.scale.setScalar(s.orbScale * scalePulse);

      const jitter =
        (this.rng.random() - 0.5) *
        (0.01 + s.turbulence * 0.02 + this.hatchPulse * 0.04);
      this.ctx.orbGroup.position.y =
        this.baseYOffset + s.orbYOffset + breath + jitter;
      this.ctx.orbGroup.position.z = s.orbZOffset;

      this.ctx.orbGroup.rotation.y += (s.spinSpeed + s.turbulence * 0.15) * dt;
      this.ctx.orbGroup.rotation.x =
        Math.sin(time * 0.45) * (s.wobble + s.turbulence * 0.35);
    }

    orbGeometry.setDeformAmplitude(this.ctx, {
      base: s.deformBase,
      pulse: s.deformPulse,
      dislocation: s.dislocation,
    });
    orbGeometry.deformPolyhedron(this.ctx, time);

    const wireOpacity = s.wireOpacity;
    this.ctx._wireVisibilityMul = this._climateWireOpacityMul ?? 1.0;

    orbGeometry.updateWireframeStyle(
      this.ctx,
      s.wireColor,
      wireOpacity,
      time,
      this.ctx.ritualGenome?.geometry?.turbulence ?? 0.2,
    );

    orbPoly.updatePolyDeformation?.(this.ctx, time);

    const drift = g?.lighting?.drift ?? 0.2;

    const p = this.progress || 0;
    const finalPhase = smoothstep01(0.88, 1.0, p);
    const orbScale = this.ctx.orbGroup?.scale?.x ?? s.orbScale ?? 1.0;
    const smallOrb = smoothstep01(0.35, 0.18, orbScale);
    const lightAttenuation = 1.0 - (finalPhase * 0.22 + smallOrb * 0.18);

    const baseKeyIntensity = Math.min(
      2.2,
      (s.lightKey + flashAdd) * lightAttenuation,
    );
    const baseFillIntensity = Math.min(1.2, s.lightFill * lightAttenuation);
    const baseRimIntensity = Math.min(0.95, s.rim * lightAttenuation);

    const safety = this.ctx.lightSafetyGovernor?.update(dtMs) || null;
    const safetyFactor = safety?.safetyFactor ?? 1.0;
    this.ctx.safetyFactor = safetyFactor;

    this.applyTargetsToRuntime(
      this.ctx,
      this.ctx.climateTargets,
      safetyFactor,
      safety?.bloomClamp ?? null,
    );

    if (this.ctx.climateTargets) {
      this.ctx._foregroundOpacityBase = s.foregroundOpacity;
      this._renderMapOpts.dt = dtMs;

      const prevParams = this.ctx.renderParams ?? null;
      const rp = mapClimateToRenderParams(
        this.ctx.climateTargets,
        this._renderMapOpts,
        prevParams,
      );

      this.ctx.renderParams = rp;

      const materialsRuntimeFlags = this.ctx?.runtimeFlags?.materials ?? null;
      applyMaterials(this.ctx, rp, dtMs, materialsRuntimeFlags);

      if (this.ctx?.runtimeFlags?.emergencyMode) {
        if (this.foregroundMesh) this.foregroundMesh.visible = false;
      } else {
        if (this.foregroundMesh) {
          this.foregroundMesh.visible = rp.opacity.foregroundOpacity > 0.01;
        }
      }
    }

    if (this.ctx.renderer) {
      let finalExposure = null;
      if (this.ctx?.runtimeFlags?.emergencyMode) {
        finalExposure = 2.2;
      } else {
        let nextExposure = null;
        if (typeof this.ctx.baseExposure === 'number') {
          nextExposure = Math.max(1.18, this.ctx.baseExposure * safetyFactor);
        }
        if (safety?.exposureClamp != null) {
          const baseValue =
            typeof nextExposure === 'number'
              ? nextExposure
              : this.ctx.renderer.toneMappingExposure;
          nextExposure =
            typeof baseValue === 'number'
              ? Math.min(baseValue, safety.exposureClamp)
              : safety.exposureClamp;
        }
        if (typeof nextExposure === 'number') {
          finalExposure = nextExposure;
        }
      }

      // FIX AST: Assignation unique (Single Writer) pour audit-runtime.step.log
      if (finalExposure !== null) {
        this.ctx.renderer.toneMappingExposure = finalExposure;
      }
    }

    const keyIntensity = Math.min(2.2, baseKeyIntensity * safetyFactor);
    const fillIntensity = Math.min(1.2, baseFillIntensity * safetyFactor);
    const rimIntensity = Math.min(0.95, baseRimIntensity * safetyFactor);

    const sunPos = {
      x: 5.6 + Math.sin(time * drift) * 2.2,
      y: 3.2 + Math.cos(time * drift * 1.1) * 1.2,
      z: 1.0 + Math.sin(time * drift * 0.7) * 1.2,
    };

    const warm = g?.lighting?.warmth ?? 0.0;
    const keyColor = s.lightColor.clone().offsetHSL(warm, 0.0, 0.0);

    orbLighting.setLightConfig(this.ctx, 'sun-main', {
      intensity: keyIntensity,
      color: keyColor,
      position: sunPos,
    });
    orbLighting.setLightConfig(this.ctx, 'fill-hemi', {
      intensity: fillIntensity,
      color: s.lightColor.clone().multiplyScalar(0.9),
      groundColor: s.bgColor.clone().multiplyScalar(0.9),
    });
    orbLighting.setLightConfig(this.ctx, 'rim-point', {
      intensity: rimIntensity,
      color:
        g?.palette?.accent?.clone?.().multiplyScalar(0.9) ??
        s.lightColor.clone().multiplyScalar(0.9),
      position: { x: -3.4, y: 2.0, z: -4.4 },
    });

    orbLighting.updateLightsForFrame(this.ctx, time);

    const baseGlowIntensity =
      typeof volumeCfg?.glowIntensity === 'number'
        ? volumeCfg.glowIntensity
        : s.glowIntensity;
    const baseBackgroundStrength =
      typeof volumeCfg?.backgroundStrength === 'number'
        ? volumeCfg.backgroundStrength
        : s.backgroundStrength;

    if (volumeCfg) {
      volumeCfg.glowIntensity = Math.min(
        0.9,
        baseGlowIntensity + flashAdd * 0.12 * safetyFactor,
      );
      volumeCfg.backgroundStrength = Math.max(
        0,
        baseBackgroundStrength + Math.sin(time * 0.5) * 0.035 * safetyFactor,
      );
    }

    updateVolumeSafe(this.ctx, time);

    if (orbParticles.animateParticles) {
      const turb =
        (this.ctx.ritualGenome?.geometry?.turbulence ?? 0.2) *
        this.ritualDNA.noiseScale;
      orbParticles.animateParticles(this.ctx, time, turb);
    }
    orbParticles.updateParticleLinks?.(this.ctx);
    orbParticles.updateParticleTrails?.(this.ctx);

    orbFluidParticles.updateFluidParticles?.(this.ctx, dt);

    if (this.foregroundMesh) {
      this.foregroundMesh.rotation.z = time * 0.02;
    }

    orbGround?.updateGroundDeformation?.(this.ctx, time);

    // INJECTION DU PONT D'AUDIT
    if (
      typeof window !== 'undefined' &&
      typeof OrbAuditBridge !== 'undefined'
    ) {
      OrbAuditBridge.captureRuntimeState(this.ctx);
    }
  }
}
