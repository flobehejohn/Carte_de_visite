import * as THREE from 'three';
import * as orbGeometry from './modules/orbGeometry';
import * as orbGround from './modules/orbGround';
import * as orbLighting from './modules/orbLighting';
import * as orbParticles from './modules/orbParticles';
import * as orbVolumes from './modules/orbVolumes';
import * as orbPoly from './modules/orbPoly';
import * as orbFluidParticles from './modules/orbFluidParticles';

/**
 * RitualOrchestrator — version "Ultime"
 * Objectifs:
 * - Variabilité énorme mais contrôlée (pas de lumière extrême)
 * - Interdépendance subtile entre modules via ctx.ritualGenome
 * - Wireframes en couches vivantes + particules "liaisons" lentes et "burst" rapides
 * - Déterminisme optionnel (seed) + unicité par défaut
 */

/* -------------------------- RNG déterministe -------------------------- */
// cyrb128 -> seed32 ; puis sfc32 pour un flux meilleur
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
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
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
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
  const api = {
    seedString,
    random: () => rand(),
    float: (min, max) => min + (max - min) * rand(),
    int: (min, max) => Math.floor(min + (max - min + 1) * rand()),
    bool: (p = 0.5) => rand() < p,
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    sign: () => (rand() < 0.5 ? -1 : 1),
    // bruit lisse 1D basé sur sin (utile sans dépendances)
    smooth01: (t, freq = 1) => 0.5 + 0.5 * Math.sin(t * freq),
  };
  return api;
}

function clamp01(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }
function damp(current, target, lambda, dt) { return current + (target - current) * (1 - Math.exp(-lambda * dt)); }

function hashToUnit(input) {
  if (!input || typeof input !== 'string') return 0.5;
  const seed = input.trim();
  if (!seed) return 0.5;
  const [a,b,c,d] = cyrb128(seed);
  const r = sfc32(a,b,c,d);
  return r();
}

/* ---------------------------- Pools esthétiques ---------------------------- */
const SHAPE_POOL_LOW = ['tetra', 'octa', 'box', 'cone'];
const SHAPE_POOL_MID = ['icosa', 'dodeca', 'sphere', 'capsule', 'torus'];
const SHAPE_POOL_HIGH = ['torusKnot', 'octaDetail', 'knotComplex', 'torus', 'torusKnot'];

const PALETTE_MODES = ['mono', 'complement', 'split', 'triad', 'analog'];
const MOTION_SIGNATURES = ['calm', 'breath', 'link', 'storm', 'burst'];

/* ---------------------------- Orchestrateur ---------------------------- */
export class RitualOrchestrator {
  constructor(ctx) {
    this.ctx = ctx;
    this.mood = 'Default';
    this.progress = 0;
    this.lastTime = 0;

    this.baseRadius = ctx?.orbShellConfig?.radius ?? 1.7;
    this.baseYOffset = ctx?.orbGroup?.position?.y ?? 0;

    this.hatchPulse = 0;
    this.revealActive = false;
    this.flashTimer = 0;

    this.foregroundMesh = null;
    this.llmParams = null;
    this.textLength = 0;

    this.motion = { mode: 'calm', phase: 0, energy: 0.25, lastSwitch: 0 };

    // rng par défaut
    this.rng = makeRng(`ritual-default-${Date.now()}-${Math.random()}`);

    // ADN "global" (sera régénéré)
    this.ritualDNA = {
      seed: this.rng.seedString,
      path: { p0: 'tetra', p1: 'icosa', p2: 'torusKnot' },
      texture: 'smooth',
      paletteMode: 'analog',
      noiseScale: 1.0,
      noiseSpeed: 1.0,
      particleStyle: 'shell'
    };

    // état courant / cible
    this.currentState = {
      orbScale: 0.001,
      orbYOffset: 0, orbZOffset: 0,

      lightKey: 0.0,
      lightFill: 0.0,
      rim: 0.0,

      bloomStrength: 0.0,
      fogDensity: 0.0,

      deformBase: 0.0,
      deformPulse: 0.0,
      dislocation: 0.0,
      turbulence: 0.0,

      spinSpeed: 0.0,
      wobble: 0.0,

      wireOpacity: 0.0,
      backgroundStrength: 0.0,
      glowIntensity: 0.0,
      glowSize: 1.0,
      softness: 1.0,

      foregroundOpacity: 1.0,

      lightColor: new THREE.Color(0x050505),
      bgColor: new THREE.Color(0x000000),
      wireColor: new THREE.Color(0x222222),
    };
    this.targetState = { ...this.currentState };
    this.visualState = { shape: 'tetra', detail: 0 };
    this.visualTarget = { shape: 'tetra', detail: 0 };
  }

  initRitual(userName = '', options = {}) {
    // Seed: reproductible si options.seed, sinon unique
    const explicitSeed = options?.seed ? String(options.seed) : null;
    const seedString = explicitSeed ?? `${String(userName || 'Anonyme')}-${Date.now()}-${Math.random()}`;
    this.rng = makeRng(seedString);

    // ADN rituel: formes + texture + palette + signature
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
      texture: textureType < 0.33 ? 'smooth' : (textureType < 0.66 ? 'jagged' : 'liquid'),
      paletteMode,
      noiseScale: this.rng.float(0.55, 2.1),
      noiseSpeed: this.rng.float(0.55, 1.6),
      particleStyle: this.rng.bool(0.55) ? 'shell' : 'volume',
      signature,
    };

    this.llmParams = null;
    this.textLength = 0;
    this.revealActive = false;
    this.flashTimer = 0;
    this.hatchPulse = 0;

    // ctx.ritualGenome est le "bus" d'interdépendance entre modules
    this.ctx.ritualGenome = this._buildGenome({ progress: 0, payload: null });

    // Hard reset "safe"
    this.ctx.orbShellConfig = this.ctx.orbShellConfig || {};
    this.ctx.orbShellConfig.radius = this.baseRadius;

    // Forme initiale
    this.ctx.orbShellConfig.shapeType = this.ritualDNA.path.p0;
    this.ctx.orbShellConfig.detail = 0;

    // Init modules
    orbGeometry.setRitualConfig?.(this.ctx, this.ctx.ritualGenome);
    orbGeometry.createPolyhedron(this.ctx);

    this.ctx.lightConfig = { dirIntensity: 0, hemiIntensity: 0 };
    orbLighting.initDefaultLights(this.ctx);

    orbGround?.buildGround?.(this.ctx);
    orbVolumes.buildVolume(this.ctx);

    // poly + fluid optionnels (mais superbes)
    orbPoly.setPolyConfig?.(this.ctx, { enabled: false });
    orbFluidParticles.setFluidParticlesConfig?.(this.ctx, { enabled: false });

    // Foreground (voile) — doux
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
      this.foregroundMesh.material.color.setHex(0x000000);
      this.foregroundMesh.material.opacity = 1.0;
    }

    // Particules off au départ
    orbParticles.setParticlesConfig?.(this.ctx, { enabled: false });

    // Reset state (noir vivant)
    Object.assign(this.currentState, {
      orbScale: 0.0,
      lightKey: 0,
      lightFill: 0,
      rim: 0,
      bloomStrength: 0,
      fogDensity: 0,
      glowIntensity: 0,
      wireOpacity: 0,
    });
    this.currentState.lightColor.setHex(0x020202);
    this.currentState.bgColor.setHex(0x000000);
    this.currentState.wireColor.setHex(0x111111);

    // logs
    console.info('[Orchestrator] Seed:', seedString);
    console.info('[Orchestrator] ADN:', this.ritualDNA);

    this.updateState(0, {});
  }

  setMood(moodName) {
    this.mood = moodName || 'Default';
    this.updateState(this.progress, this.lastInputs);
  }

  setRitualData(payload = {}) {
    if (payload.mood) this.mood = payload.mood;
    if (payload.visualParams) {
      this.llmParams = payload.visualParams;
      this.hatchPulse = 0.55;
    }
    if (payload.textLength) this.textLength = payload.textLength;

    // Option: seed venant du backend / LLM
    if (payload.seed && typeof payload.seed === 'string') {
      this.rng = makeRng(payload.seed);
      this.ritualDNA.seed = payload.seed;
    }

    this.lastInputs = { ...this.lastInputs, ...payload };
    this.updateState(this.progress, this.lastInputs);
  }

  /* ----------- Génération d'un "génome" partagé (inter-modules) ----------- */
  _buildGenome({ progress, payload }) {
    const p = clamp01(progress);
    const data = payload || {};

    const fearSig = hashToUnit(data.fear);
    const desireSig = hashToUnit(data.desire);
    const chaosLLM = clamp01(this.llmParams?.chaos ?? 0.35);

    const textureFactor = this.ritualDNA.texture === 'jagged' ? 1.15 : (this.ritualDNA.texture === 'liquid' ? 1.05 : 0.95);
    const chaos = clamp01(chaosLLM * textureFactor);

    // palette de base
    const baseHue = this.llmParams?.primary_color
      ? new THREE.Color(this.llmParams.primary_color).getHSL({ h: 0, s: 0, l: 0 }).h
      : (data.fear ? fearSig * 0.08 : (0.55 + desireSig * 0.18));

    const sat = 0.45 + chaos * 0.35;
    const lum = 0.46 + (0.12 * (1 - chaos));
    const primary = new THREE.Color().setHSL(baseHue, sat, lum);

    const paletteMode = this.ritualDNA.paletteMode;
    const hueShift = (x) => ((x % 1) + 1) % 1;

    const palette = (() => {
      if (paletteMode === 'mono') return { primary, secondary: primary.clone().offsetHSL(0, -0.08, 0.08), accent: primary.clone().offsetHSL(0, 0.08, -0.06) };
      if (paletteMode === 'complement') return { primary, secondary: new THREE.Color().setHSL(hueShift(baseHue + 0.5), sat * 0.9, lum), accent: primary.clone().offsetHSL(0.08, 0.1, 0.06) };
      if (paletteMode === 'split') return { primary, secondary: new THREE.Color().setHSL(hueShift(baseHue + 0.45), sat * 0.9, lum), accent: new THREE.Color().setHSL(hueShift(baseHue + 0.55), sat * 0.9, lum) };
      if (paletteMode === 'triad') return { primary, secondary: new THREE.Color().setHSL(hueShift(baseHue + 1/3), sat * 0.85, lum), accent: new THREE.Color().setHSL(hueShift(baseHue + 2/3), sat * 0.85, lum) };
      // analog
      return { primary, secondary: new THREE.Color().setHSL(hueShift(baseHue + 0.06), sat * 0.95, lum), accent: new THREE.Color().setHSL(hueShift(baseHue - 0.06), sat * 0.95, lum) };
    })();

    // wire layers
    const wireLayers = this.rng.int(2, 6);
    const wireSpacing = this.rng.float(0.035, 0.085);
    const wireBreath = this.rng.float(0.15, 0.35);

    // motion signature (tendances)
    const signature = this.ritualDNA.signature;
    const motion = {
      signature,
      // énergie globale (de calme à tempête)
      energy: THREE.MathUtils.clamp(0.18 + chaos * 0.62 + p * 0.22, 0.12, 0.95),
      // probas de bascule "liaisons" vs "burst"
      linkBias: THREE.MathUtils.clamp(0.45 + (signature === 'link' ? 0.25 : 0) - chaos * 0.15, 0.15, 0.85),
      burstBias: THREE.MathUtils.clamp(0.18 + (signature === 'burst' ? 0.35 : 0) + chaos * 0.25, 0.10, 0.85),
    };

    // particules
    const density = THREE.MathUtils.clamp(0.35 + chaos * 0.6 + (signature === 'storm' ? 0.15 : 0), 0.2, 1.0);
    const particleCount = Math.floor(180 + density * 820);
    const particleSize = this.rng.float(0.06, 0.18) * (0.9 + chaos * 0.35);
    const linkDistance = this.rng.float(0.85, 1.6) * (1.1 - chaos * 0.35);

    const volume = {
      enabled: true,
      backgroundColor: palette.primary.clone().multiplyScalar(0.06),
      glowColor: palette.primary.clone(),
      glowIntensity: THREE.MathUtils.clamp(0.25 + p * 0.35 + chaos * 0.18, 0.15, 0.85),
      backgroundStrength: THREE.MathUtils.clamp(0.35 + p * 0.35, 0.2, 0.9),
      softness: THREE.MathUtils.clamp(0.65 - p * 0.55 + chaos * 0.2, 0.12, 0.85),
      noise: {
        scale: this.rng.float(2.4, 6.8),
        speed: this.rng.float(0.08, 0.28) * (0.8 + chaos),
        amount: this.rng.float(0.06, 0.18) * (0.8 + chaos),
      },
    };

    const lighting = {
      // intensités douces: jamais "aveuglantes"
      key: THREE.MathUtils.clamp(0.25 + p * 1.15 + chaos * 0.35, 0.15, 1.85),
      fill: THREE.MathUtils.clamp(0.08 + p * 0.55, 0.05, 0.85),
      rim: THREE.MathUtils.clamp(0.02 + chaos * 0.35 + (p > 0.8 ? 0.12 : 0), 0.0, 0.65),
      warmth: this.rng.float(-0.05, 0.08),
      drift: this.rng.float(0.12, 0.28),
    };

    const geometry = {
      // déformations "vivantes", jamais destructives
      baseDeform: THREE.MathUtils.clamp(0.02 + p * 0.22 + chaos * 0.16, 0.0, 0.45),
      pulseDeform: THREE.MathUtils.clamp(0.02 + p * 0.16 + chaos * 0.18, 0.0, 0.45),
      dislocation: THREE.MathUtils.clamp(0.0 + chaos * 0.08, 0.0, 0.18),
      turbulence: THREE.MathUtils.clamp(0.08 + chaos * 0.55 + p * 0.25, 0.05, 0.95),
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
      }
    };

    const particles = {
      enabled: p > 0.12,
      count: particleCount,
      size: particleSize,
      opacity: THREE.MathUtils.clamp(0.35 + p * 0.4, 0.22, 0.85),
      color1: palette.primary.clone(),
      color2: palette.accent.clone(),
      radiusFactor: THREE.MathUtils.clamp(1.1 + p * 0.55, 1.1, 1.9),
      distribution: this.ritualDNA.particleStyle === 'volume' ? 'volume' : 'shell',
      linkDistance,
      trailLength: Math.floor(10 + p * 14 + chaos * 8),
      trailFade: THREE.MathUtils.clamp(0.86 + chaos * 0.08, 0.84, 0.96),
      dynamics: {
        // oscillation entre mode liaisons et mode speed
        lfoSpeed: this.rng.float(0.08, 0.22) * (0.8 + chaos),
        linkBias: motion.linkBias,
        burstBias: motion.burstBias,
        maxNeighbors: Math.floor(18 + density * 24),
      }
    };

    // poly / fluid (optionnels): activés surtout en phase 2+
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
      flowStrength: THREE.MathUtils.clamp(0.6 + chaos * 1.2 + p * 0.35, 0.35, 2.2),
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
      // petit "contrat" d'API: les modules peuvent utiliser ctx.ritualGenome.rng si besoin
      rng: this.rng,
    };
  }

  updateState(progress, payload = this.lastInputs) {
    this.progress = clamp01(progress);
    const p = this.progress;
    const data = payload || {};
    const reveal = p > 0.9;

    // construit et publie le génome
    const genome = this._buildGenome({ progress: p, payload: data });
    this.ctx.ritualGenome = genome;

    // couleurs
    const baseColor = genome.palette.primary;
    this.targetState.lightColor.copy(baseColor);
    this.targetState.bgColor.copy(genome.volume.backgroundColor);
    this.targetState.wireColor.copy(genome.geometry.colors.wire);

    // progression -> forme / detail
    if (p < 0.15) this.visualTarget = { shape: this.ritualDNA.path.p0, detail: 0 };
    else if (p < 0.5) this.visualTarget = { shape: this.ritualDNA.path.p1, detail: 1 };
    else if (p < 0.85) this.visualTarget = { shape: this.ritualDNA.path.p2, detail: 2 };
    else {
      const finalShape = this.llmParams?.shape_archetype || this.ritualDNA.path.p2;
      this.visualTarget = { shape: finalShape, detail: 4 };
      if (reveal && !this.revealActive) {
        this.revealActive = true;
        // flash très court, non agressif
        this.flashTimer = 0.7;
      }
    }

    // states (avec garde-fous doux)
    this.targetState.orbScale = p < 0.12 ? 0.75 : (p < 0.5 ? 1.0 : 1.05);
    this.targetState.wireOpacity = genome.geometry.wire.opacityBase;
    this.targetState.softness = genome.volume.softness;
    this.targetState.backgroundStrength = genome.volume.backgroundStrength;
    this.targetState.glowIntensity = genome.volume.glowIntensity;

    // lumières (séparées)
    this.targetState.lightKey = genome.lighting.key;
    this.targetState.lightFill = genome.lighting.fill;
    this.targetState.rim = genome.lighting.rim;

    // déformation
    this.targetState.deformBase = genome.geometry.baseDeform;
    this.targetState.deformPulse = genome.geometry.pulseDeform;
    this.targetState.dislocation = genome.geometry.dislocation;
    this.targetState.turbulence = genome.geometry.turbulence;

    // dynamique globale
    this.targetState.spinSpeed = 0.06 + genome.motion.energy * 0.22;
    this.targetState.wobble = 0.05 + genome.motion.energy * 0.18;

    // particules: un seul point de vérité = genome.particles
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
      // le mode final est géré par l'orchestrateur + lfo interne particules
      mode: p < 0.35 ? 'points' : (p < 0.7 ? 'links' : 'trails'),
    });

    // volume
    orbVolumes.setVolumeConfig?.(this.ctx, {
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

    // geometry config (wire layers etc.)
    orbGeometry.setRitualConfig?.(this.ctx, genome);

    // poly
    orbPoly.setPolyConfig?.(this.ctx, { ...genome.poly, enabled: genome.poly.enabled });

    // fluid
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
      // ancrage au centre de l'orb
      flowCenter: { x: 0, y: 0, z: 0 },
      flowDirection: { x: 0, y: 1, z: 0 },
    });

    // positionnement adaptatif (texte)
    if (reveal) {
      const textRatio = Math.min(1.0, this.textLength / 520);
      this.targetState.orbScale = 0.46 - (textRatio * 0.16);
      this.targetState.orbYOffset = 1.25 + (textRatio * 0.55);
      this.targetState.orbZOffset = -2.35 - (textRatio * 1.1);
    } else {
      this.targetState.orbYOffset = 0.0;
      this.targetState.orbZOffset = 0.0;
    }

    // voile
    this.targetState.foregroundOpacity = p < 0.12 ? 0.25 : (p < 0.4 ? 0.06 : 0.0);

    this.updateVisuals();
  }

  updateVisuals() {
    const t = this.visualTarget;
    if (this.visualState.shape !== t.shape || this.visualState.detail !== t.detail) {
      orbGeometry.setShapeType(this.ctx, t.shape);
      orbGeometry.setPolyDetail(this.ctx, t.detail);
      this.visualState.shape = t.shape;
      this.visualState.detail = t.detail;
      this.hatchPulse = 1.0;
    }
  }

  _updateMotionMode(time, dt) {
    const g = this.ctx.ritualGenome;
    if (!g) return;

    // LFO: bascule douce entre "liaisons" et "accélérations"
    const lfo = 0.5 + 0.5 * Math.sin(time * g.particles.dynamics.lfoSpeed * Math.PI * 2);
    const wantLinks = lfo < g.motion.linkBias;
    const wantBurst = lfo > (1.0 - g.motion.burstBias);

    // petit state machine
    if (wantBurst && this.motion.mode !== 'burst') {
      this.motion.mode = 'burst';
      this.motion.lastSwitch = time;
      this.motion.energy = Math.min(1, g.motion.energy + 0.15);
    } else if (wantLinks && this.motion.mode !== 'link') {
      this.motion.mode = 'link';
      this.motion.lastSwitch = time;
      this.motion.energy = Math.max(0.12, g.motion.energy - 0.1);
    } else if (!wantBurst && !wantLinks && this.motion.mode !== 'breath') {
      this.motion.mode = 'breath';
      this.motion.lastSwitch = time;
      this.motion.energy = g.motion.energy;
    }

    // Influence subtile sur particules
    const mode = this.motion.mode === 'burst' ? 'points' : (this.motion.mode === 'link' ? 'links' : 'trails');
    orbParticles.setParticlesConfig?.(this.ctx, { mode, dynamics: { ...g.particles.dynamics, burst: this.motion.mode === 'burst' } });
  }

  update(time = 0) {
    const dt = Math.min(0.05, Math.max(0.001, time - (this.lastTime || time)));
    this.lastTime = time;

    const s = this.currentState;
    const t = this.targetState;

    // flash (jamais violent)
    let flashAdd = 0;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      flashAdd = Math.min(0.65, this.flashTimer * 0.85);
    }

    if (this.hatchPulse > 0.01) this.hatchPulse *= (1.0 - dt * 3.2); else this.hatchPulse = 0;

    const smooth = 3.2;
    for (const k in s) {
      if (typeof s[k] === 'number') s[k] = damp(s[k], t[k], smooth, dt);
    }
    s.lightColor.lerp(t.lightColor, dt * 2.0);
    s.bgColor.lerp(t.bgColor, dt * 2.0);
    s.wireColor.lerp(t.wireColor, dt * 2.0);

    // Motion mode (liaisons / burst)
    this._updateMotionMode(time, dt);

    // Groupe orb
    if (this.ctx.orbGroup) {
      const g = this.ctx.ritualGenome;
      const breath = Math.sin(time * (0.8 + g.motion.energy * 1.2)) * 0.025;
      const heart = Math.sin(time * (1.6 + g.motion.energy * 1.8)) * (0.02 + s.turbulence * 0.06);

      const scalePulse = 1 + this.hatchPulse * 0.18 + heart * 0.18;
      this.ctx.orbGroup.scale.setScalar(s.orbScale * scalePulse);

      // jitter déterministe très léger
      const jitter = (this.rng.random() - 0.5) * (0.01 + s.turbulence * 0.02 + this.hatchPulse * 0.04);
      this.ctx.orbGroup.position.y = this.baseYOffset + s.orbYOffset + breath + jitter;
      this.ctx.orbGroup.position.z = s.orbZOffset;

      this.ctx.orbGroup.rotation.y += (s.spinSpeed + s.turbulence * 0.15) * dt;
      this.ctx.orbGroup.rotation.x = Math.sin(time * 0.45) * (s.wobble + s.turbulence * 0.35);
    }

    // Déformation géométrie & wireframe multi-couches
    orbGeometry.setDeformAmplitude(this.ctx, { base: s.deformBase, pulse: s.deformPulse, dislocation: s.dislocation });
    orbGeometry.deformPolyhedron(this.ctx, time);
    orbGeometry.updateWireframeStyle(this.ctx, s.wireColor, s.wireOpacity, time, this.ctx.ritualGenome?.geometry?.turbulence ?? 0.2);

    // Poly (deformation)
    orbPoly.updatePolyDeformation?.(this.ctx, time);

    // Lighting — doux & vivant
    const g = this.ctx.ritualGenome;
    const drift = g?.lighting?.drift ?? 0.2;

    const keyIntensity = Math.min(2.2, s.lightKey + flashAdd);
    const fillIntensity = Math.min(1.2, s.lightFill);
    const rimIntensity = Math.min(0.95, s.rim);

    const sunPos = {
      x: 5.6 + Math.sin(time * drift) * 2.2,
      y: 3.2 + Math.cos(time * drift * 1.1) * 1.2,
      z: 1.0 + Math.sin(time * drift * 0.7) * 1.2
    };

    // teinte: chaleur légère
    const warm = g?.lighting?.warmth ?? 0.0;
    const keyColor = s.lightColor.clone().offsetHSL(warm, 0.0, 0.0);

    orbLighting.setLightConfig(this.ctx, 'sun-main', { intensity: keyIntensity, color: keyColor, position: sunPos });
    orbLighting.setLightConfig(this.ctx, 'fill-hemi', {
      intensity: fillIntensity,
      color: s.lightColor.clone().multiplyScalar(0.9),
      groundColor: s.bgColor.clone().multiplyScalar(0.9)
    });
    orbLighting.setLightConfig(this.ctx, 'rim-point', {
      intensity: rimIntensity,
      color: g.palette.accent.clone().multiplyScalar(0.9),
      position: { x: -3.4, y: 2.0, z: -4.4 }
    });

    orbLighting.updateLightsForFrame(this.ctx, time);

    // Volume (background + glow)
    const volumeCfg = orbVolumes.ensureVolumeConfig(this.ctx);
    volumeCfg.glowIntensity = Math.min(0.9, s.glowIntensity + flashAdd * 0.12);
    volumeCfg.glowColor = s.lightColor;
    volumeCfg.backgroundColor = s.bgColor;
    volumeCfg.backgroundStrength = s.backgroundStrength + Math.sin(time * 0.5) * 0.035;
    volumeCfg.softness = s.softness;
    volumeCfg.vignette = 1.05;
    orbVolumes.updateVolumeForFrame(this.ctx, time);

    // Particules: animation + liaisons + trails
    if (orbParticles.animateParticles) {
      const turb = (this.ctx.ritualGenome?.geometry?.turbulence ?? 0.2) * this.ritualDNA.noiseScale;
      orbParticles.animateParticles(this.ctx, time, turb);
    }
    orbParticles.updateParticleLinks?.(this.ctx);
    orbParticles.updateParticleTrails?.(this.ctx);

    // Fluid particles (instanced)
    orbFluidParticles.updateFluidParticles?.(this.ctx, dt);

    // Voile
    if (this.foregroundMesh) {
      this.foregroundMesh.material.opacity = s.foregroundOpacity;
      this.foregroundMesh.visible = s.foregroundOpacity > 0.01;
      this.foregroundMesh.rotation.z = time * 0.02;
    }

    // Ground (si présent)
    orbGround?.updateGroundDeformation?.(this.ctx, time);
  }
}
