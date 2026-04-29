import { orbLog } from '../../shared/debug/orbDebug';
import { SAFE_RANGES, buildPresetVariants } from './presetLibrary';
import { resolveRuntimeOpticsPolicy, type RuntimeOpticsPolicy } from '../render/optics/runtimeOpticsPolicy';
import {
  computeSmokeVisualCompensation,
  type SmokePolicySource,
  type SmokePolicyState,
  type SmokeVisualCompensation,
} from '../render/optics/transparency';

export type ClimateTargets = {
  presetName: string;
  fog: { enabled: boolean; density: number; color: string | number };
  bloom: { strength: number; radius: number; threshold: number };
  bloomPolicy?: RuntimeOpticsPolicy['bloomPolicy'];
  iridescencePolicy?: RuntimeOpticsPolicy['iridescencePolicy'];
  volume: {
    glowIntensity: number;
    backgroundStrength: number;
    softness: number;
    vignette: number;
    bgColor?: string | number;
    glowColor?: string | number;
  };
  opacity: {
    wireOpacityMul: number;
    particlesOpacityMul: number;
    foregroundOpacity?: number;
  };
  smoke?: {
    state: SmokePolicyState;
    alphaLayer: number;
    source: SmokePolicySource;
    compensation: SmokeVisualCompensation;
  };
};

export type ClimateRuntimeTelemetry = {
  version: 'climate-runtime-v1';
  lastProgress: number;
  lastDtMs: number | null;
  updateCount: number;
  lastUpdatedAtMs: number | null;
  targetsVersion: number;
  lastTargetsSnapshot: ClimateTargets | null;
};

type ClimateControllerConfig = {
  seed?: string;
  debug?: boolean;
};

type ClimateSmokeRuntimeState = {
  state: SmokePolicyState;
  alphaLayer: number;
  source: SmokePolicySource;
  compensation: SmokeVisualCompensation;
};

type ClimatePresetDef = {
  name: string;
  colors: { fog: number; glow: number; bg: number };
  fog: { low: number; mid: number; peak: number; end: number };
  bloomStrength: { low: number; mid: number; peak: number; end: number };
  bloomRadius: { low: number; mid: number; peak: number; end: number };
  bloomThreshold: { low: number; mid: number; peak: number; end: number };
  glowIntensity: { low: number; mid: number; peak: number; end: number };
  backgroundStrength: { low: number; mid: number; peak: number; end: number };
  softness: { low: number; mid: number; peak: number; end: number };
  wireOpacityMul: { low: number; mid: number; peak: number; end: number };
  particlesOpacityMul: { low: number; mid: number; peak: number; end: number };
  foregroundOpacityMul: { low: number; mid: number; peak: number; end: number };
  vignette: number;
};

const PRESETS_BASE: Record<string, ClimatePresetDef> = {
  Cendre: {
    name: 'Cendre',
    colors: { fog: 0x24262c, glow: 0x8f8676, bg: 0x16181d },
    fog: { low: 0.024, mid: 0.02, peak: 0.017, end: 0.014 },
    bloomStrength: { low: 0.15, mid: 0.25, peak: 0.4, end: 0.22 },
    bloomRadius: { low: 0.12, mid: 0.2, peak: 0.25, end: 0.15 },
    bloomThreshold: { low: 0.9, mid: 0.88, peak: 0.84, end: 0.9 },
    glowIntensity: { low: 0.32, mid: 0.42, peak: 0.56, end: 0.38 },
    backgroundStrength: { low: 0.22, mid: 0.28, peak: 0.34, end: 0.24 },
    softness: { low: 0.35, mid: 0.4, peak: 0.45, end: 0.38 },
    wireOpacityMul: { low: 0.7, mid: 0.75, peak: 0.85, end: 0.75 },
    particlesOpacityMul: { low: 0.7, mid: 0.8, peak: 0.9, end: 0.75 },
    foregroundOpacityMul: { low: 0.95, mid: 1.05, peak: 1.2, end: 1.0 },
    vignette: 1.1,
  },
  "Brume d'or": {
    name: "Brume d'or",
    colors: { fog: 0x342b1d, glow: 0xffd28a, bg: 0x1c1710 },
    fog: { low: 0.02, mid: 0.017, peak: 0.015, end: 0.013 },
    bloomStrength: { low: 0.3, mid: 0.5, peak: 0.75, end: 0.4 },
    bloomRadius: { low: 0.18, mid: 0.28, peak: 0.35, end: 0.22 },
    bloomThreshold: { low: 0.82, mid: 0.78, peak: 0.74, end: 0.84 },
    glowIntensity: { low: 0.35, mid: 0.5, peak: 0.75, end: 0.45 },
    backgroundStrength: { low: 0.24, mid: 0.3, peak: 0.38, end: 0.28 },
    softness: { low: 0.45, mid: 0.55, peak: 0.65, end: 0.5 },
    wireOpacityMul: { low: 0.8, mid: 0.9, peak: 1.05, end: 0.85 },
    particlesOpacityMul: { low: 0.8, mid: 0.95, peak: 1.1, end: 0.9 },
    foregroundOpacityMul: { low: 0.35, mid: 0.5, peak: 0.7, end: 0.4 },
    vignette: 1.05,
  },
  'Nuit froide': {
    name: 'Nuit froide',
    colors: { fog: 0x16213a, glow: 0xb8d3ff, bg: 0x0d1424 },
    fog: { low: 0.012, mid: 0.01, peak: 0.0085, end: 0.007 },
    bloomStrength: { low: 0.12, mid: 0.2, peak: 0.3, end: 0.15 },
    bloomRadius: { low: 0.1, mid: 0.15, peak: 0.2, end: 0.12 },
    bloomThreshold: { low: 0.9, mid: 0.88, peak: 0.86, end: 0.9 },
    glowIntensity: { low: 0.34, mid: 0.44, peak: 0.58, end: 0.4 },
    backgroundStrength: { low: 0.18, mid: 0.24, peak: 0.3, end: 0.2 },
    softness: { low: 0.4, mid: 0.45, peak: 0.5, end: 0.42 },
    wireOpacityMul: { low: 0.7, mid: 0.8, peak: 0.9, end: 0.75 },
    particlesOpacityMul: { low: 0.65, mid: 0.75, peak: 0.85, end: 0.7 },
    foregroundOpacityMul: { low: 0.45, mid: 0.6, peak: 0.8, end: 0.5 },
    vignette: 1.1,
  },
  Aurore: {
    name: 'Aurore',
    colors: { fog: 0x3b231c, glow: 0xffb28c, bg: 0x1a1011 },
    fog: { low: 0.016, mid: 0.013, peak: 0.011, end: 0.009 },
    bloomStrength: { low: 0.2, mid: 0.45, peak: 0.85, end: 0.3 },
    bloomRadius: { low: 0.12, mid: 0.24, peak: 0.4, end: 0.18 },
    bloomThreshold: { low: 0.86, mid: 0.8, peak: 0.74, end: 0.88 },
    glowIntensity: { low: 0.25, mid: 0.45, peak: 0.85, end: 0.35 },
    backgroundStrength: { low: 0.22, mid: 0.28, peak: 0.36, end: 0.24 },
    softness: { low: 0.45, mid: 0.55, peak: 0.7, end: 0.5 },
    wireOpacityMul: { low: 0.8, mid: 0.95, peak: 1.15, end: 0.85 },
    particlesOpacityMul: { low: 0.8, mid: 1.0, peak: 1.2, end: 0.9 },
    foregroundOpacityMul: { low: 0.05, mid: 0.1, peak: 0.22, end: 0.08 },
    vignette: 1.05,
  },
};

const VARIANTS = buildPresetVariants(PRESETS_BASE, {
  perBase: 12,
  seed: 'preset-v1',
}) satisfies Record<string, ClimatePresetDef>;

const PRESETS = { ...PRESETS_BASE, ...VARIANTS } satisfies Record<
  string,
  ClimatePresetDef
>;

export const CLIMATE_PRESET_NAMES = Object.freeze(Object.keys(PRESETS));
const PRESET_NAMES = CLIMATE_PRESET_NAMES;
const DEFAULT_PRESET = PRESETS_BASE.Cendre;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

function clamp01(v: number) {
  return clamp(v, 0, 1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(a: number, b: number, t: number) {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

function curve4(
  t: number,
  low: number,
  mid: number,
  peak: number,
  end: number,
) {
  const rise = smoothstep(0.2, 0.7, t);
  const apex = smoothstep(0.7, 0.9, t);
  const calm = smoothstep(0.9, 1.0, t);
  let v = lerp(low, mid, rise);
  v = lerp(v, peak, apex);
  v = lerp(v, end, calm);
  return v;
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseColor(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    const num = Number.parseInt(hex, 16);
    return Number.isFinite(num) ? num : null;
  }
  if (raw.startsWith('0x') || raw.startsWith('0X')) {
    const num = Number.parseInt(raw.slice(2), 16);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function mixColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const rr = Math.round(lerp(ar, br, t));
  const rg = Math.round(lerp(ag, bg, t));
  const rb = Math.round(lerp(ab, bb, t));
  return (rr << 16) | (rg << 8) | rb;
}

function alphaForSeconds(seconds: number, dtSec: number) {
  const safe = Math.max(0.05, seconds);
  const lambda = 4 / safe;
  return 1 - Math.exp(-lambda * Math.max(0, dtSec));
}

function cloneTargets(targets: ClimateTargets | null): ClimateTargets | null {
  if (!targets) return null;
  return {
    presetName: targets.presetName,
    fog: { ...targets.fog },
    bloom: { ...targets.bloom },
    ...(targets.bloomPolicy
      ? { bloomPolicy: { ...targets.bloomPolicy } }
      : {}),
    ...(targets.iridescencePolicy
      ? { iridescencePolicy: { ...targets.iridescencePolicy } }
      : {}),    volume: { ...targets.volume },
    opacity: { ...targets.opacity },
    ...(targets.smoke
      ? {
          smoke: {
            ...targets.smoke,
            compensation: { ...targets.smoke.compensation },
          },
        }
      : {}),
  };
}

export class ClimateController {
  private seed = 'climate-default';
  private debug = false;
  private mood = 'default';
  private progress = 0;
  private visualParams: any | null = null;

  private rng = mulberry32(1);
  private timeMs = 0;
  private lastPresetChangeMs = 0;
  private minHoldMs = 12000;

  private basePreset = DEFAULT_PRESET.name;
  private altPreset = DEFAULT_PRESET.name;
  private currentPreset = DEFAULT_PRESET.name;
  private presetSwitched = false;

  private targets: ClimateTargets | null = null;
  private smokeRuntime: ClimateSmokeRuntimeState = {
    state: 'premium',
    alphaLayer: 0.18,
    source: 'quality-profile',
    compensation: computeSmokeVisualCompensation('premium', 0.18),
  };

  private transitionSec = { fog: 4, bloom: 5, volume: 5, opacity: 3.5 };
  private lastLogMs = 0;

  private runtimeTelemetry: ClimateRuntimeTelemetry = {
    version: 'climate-runtime-v1',
    lastProgress: 0,
    lastDtMs: null,
    updateCount: 0,
    lastUpdatedAtMs: null,
    targetsVersion: 0,
    lastTargetsSnapshot: null,
  };

  constructor(config: ClimateControllerConfig = {}) {
    this.debug = !!config.debug;
    if (config.seed) this.seed = String(config.seed);
    this.resetRng();
    this.refreshPresets();
    this.runtimeTelemetry.lastProgress = this.progress;
  }

  setSeed(seed: string) {
    this.seed = String(seed || 'climate-default');
    this.resetRng();
    this.refreshPresets();
  }

  setMood(mood: string) {
    this.mood = String(mood || 'default');
    this.refreshPresets();
  }

  setProgress(t01: number) {
    this.progress = clamp01(Number(t01) || 0);
    this.runtimeTelemetry.lastProgress = this.progress;
  }

  setVisualParams(visualParams: any | null) {
    this.visualParams = visualParams || null;
  }

  setSmokeRuntime(
    input:
      | Partial<ClimateSmokeRuntimeState>
      | null
      | undefined,
  ) {
    const nextState =
      input?.state ?? this.smokeRuntime.state ?? 'premium';

    const nextAlpha = clamp(
      typeof input?.alphaLayer === 'number' && Number.isFinite(input.alphaLayer)
        ? input.alphaLayer
        : this.smokeRuntime.alphaLayer,
      0,
      1,
    );

    const nextSource =
      input?.source ?? this.smokeRuntime.source ?? 'quality-profile';

    const nextCompensation =
      input?.compensation ??
      computeSmokeVisualCompensation(nextState, nextAlpha);

    this.smokeRuntime = {
      state: nextState,
      alphaLayer: nextAlpha,
      source: nextSource,
      compensation: {
        fogDensityMultiplier: clamp(nextCompensation.fogDensityMultiplier, 0, 4),
        glowIntensityMultiplier: clamp(nextCompensation.glowIntensityMultiplier, 0, 4),
        volumetricBackgroundMultiplier: clamp(nextCompensation.volumetricBackgroundMultiplier, 0, 4),
        additiveAlphaMultiplier: clamp(nextCompensation.additiveAlphaMultiplier, 0, 4),
      },
    };
  }

  update(dtMs: number) {
    const dt = Math.max(0, Number(dtMs) || 0);
    this.timeMs += dt;

    this.runtimeTelemetry.lastDtMs = dt;
    this.runtimeTelemetry.lastProgress = this.progress;
    this.runtimeTelemetry.updateCount += 1;
    this.runtimeTelemetry.lastUpdatedAtMs = Date.now();

    this.ensurePresetSwitch();

    const desired = this.computeTargets();

    if (!this.targets) {
      this.targets = desired;
    } else {
      this.targets = this.smoothTargets(this.targets, desired, dt / 1000);
    }

    this.targets = this.clampTargets(this.targets);
    this.targets = this.applyEndDampen(this.targets);
    this.targets = this.clampTargets(this.targets);

    this.runtimeTelemetry.targetsVersion += 1;
    this.runtimeTelemetry.lastTargetsSnapshot = cloneTargets(this.targets);

    this.logStatus(this.targets);
  }

  getTargets(): ClimateTargets {
    if (this.targets) {
      return this.targets;
    }

    const base = this.clampTargets(this.computeTargets());
    const computed = this.clampTargets(this.applyEndDampen(base));
    this.runtimeTelemetry.lastTargetsSnapshot = cloneTargets(computed);
    return computed;
  }

  getRuntimeTelemetry(): ClimateRuntimeTelemetry {
    return {
      version: this.runtimeTelemetry.version,
      lastProgress: this.runtimeTelemetry.lastProgress,
      lastDtMs: this.runtimeTelemetry.lastDtMs,
      updateCount: this.runtimeTelemetry.updateCount,
      lastUpdatedAtMs: this.runtimeTelemetry.lastUpdatedAtMs,
      targetsVersion: this.runtimeTelemetry.targetsVersion,
      lastTargetsSnapshot: cloneTargets(
        this.runtimeTelemetry.lastTargetsSnapshot,
      ),
    };
  }

  private applyEndDampen(targets: ClimateTargets): ClimateTargets {
    const t = clamp01(this.progress);
    const endPhase = smoothstep(0.85, 1.0, t);
    const endMul = 1 - endPhase * 0.5;

    const governedBloomStrength = targets.bloom.strength * endMul;
    const bloomPolicy: ClimateTargets['bloomPolicy'] = targets.bloomPolicy
      ? {
          ...targets.bloomPolicy,
          strength: governedBloomStrength,
          source: endPhase > 0 ? 'safety-cap' : targets.bloomPolicy.source,
          safetyClamped: targets.bloomPolicy.safetyClamped || endPhase > 0,
        }
      : undefined;
    return {
      ...targets,
      ...(bloomPolicy ? { bloomPolicy } : {}),
      bloom: {
        ...targets.bloom,
        strength: governedBloomStrength,
      },
      volume: {
        ...targets.volume,
        glowIntensity: targets.volume.glowIntensity * endMul,
      },
    };
  }

  private resetRng() {
    const seedValue = hashString(this.seed || 'climate-default');
    this.rng = mulberry32(seedValue || 1);
    this.transitionSec = {
      fog: lerp(2, 6, this.rng()),
      bloom: lerp(3, 7, this.rng()),
      volume: lerp(2, 8, this.rng()),
      opacity: lerp(2, 5, this.rng()),
    };
  }

  private refreshPresets() {
    this.basePreset = this.pickPreset('base');
    this.altPreset = this.pickPreset('late');
    this.currentPreset = this.basePreset;
    this.presetSwitched = false;
    this.lastPresetChangeMs = this.timeMs;
  }

  private pickPreset(tag: string) {
    const key = `${this.seed}|${this.mood}|${tag}`;
    const idx = hashString(key) % PRESET_NAMES.length;
    return PRESET_NAMES[idx] || DEFAULT_PRESET.name;
  }

  private ensurePresetSwitch() {
    if (this.presetSwitched) return;
    if (this.progress < 0.7) return;
    if (this.timeMs - this.lastPresetChangeMs < this.minHoldMs) return;

    if (this.altPreset !== this.currentPreset) {
      this.currentPreset = this.altPreset;
      this.presetSwitched = true;
      this.lastPresetChangeMs = this.timeMs;
    }
  }
  private resolveOpticsQualityProfile(): string {
    const audit = (globalThis as any).__ORB_AUDIT__;

    const runtimeProfile =
      this.visualParams?.qualityProfile ??
      this.visualParams?.quality_profile ??
      this.visualParams?.qualityProfileState ??
      this.visualParams?.activeQualityProfile ??
      audit?.activeQualityProfile ??
      audit?.qualityProfiles?.current ??
      (globalThis as any).__ORB_ACTIVE_QUALITY_PROFILE__ ??
      null;

    return typeof runtimeProfile === 'string' && runtimeProfile.trim()
      ? runtimeProfile.trim()
      : 'ultra';
  }

  private computeTargets(): ClimateTargets {
    const preset = PRESETS[this.currentPreset] || DEFAULT_PRESET;
    const t = clamp01(this.progress);

    const fogFromPreset = curve4(
      t,
      preset.fog.low,
      preset.fog.mid,
      preset.fog.peak,
      preset.fog.end,
    );

    const llmFogRatio = this.visualParams?.fog_density;
    const llmFogDensity =
      typeof llmFogRatio === 'number' && Number.isFinite(llmFogRatio)
        ? lerp(0.008, 0.045, clamp01(llmFogRatio))
        : null;

    const fogDensity = clamp(
      llmFogDensity != null ? llmFogDensity : fogFromPreset,
      SAFE_RANGES.fogDensity.min,
      SAFE_RANGES.fogDensity.max,
    );

    const bloomStrength = clamp(
      curve4(
        t,
        preset.bloomStrength.low,
        preset.bloomStrength.mid,
        preset.bloomStrength.peak,
        preset.bloomStrength.end,
      ),
      SAFE_RANGES.bloomStrength.min,
      SAFE_RANGES.bloomStrength.max,
    );

    const bloomRadius = clamp(
      curve4(
        t,
        preset.bloomRadius.low,
        preset.bloomRadius.mid,
        preset.bloomRadius.peak,
        preset.bloomRadius.end,
      ),
      SAFE_RANGES.bloomRadius.min,
      SAFE_RANGES.bloomRadius.max,
    );

    const bloomThreshold = clamp(
      curve4(
        t,
        preset.bloomThreshold.low,
        preset.bloomThreshold.mid,
        preset.bloomThreshold.peak,
        preset.bloomThreshold.end,
      ),
      SAFE_RANGES.bloomThreshold.min,
      SAFE_RANGES.bloomThreshold.max,
    );

    const glowIntensity = clamp(
      curve4(
        t,
        preset.glowIntensity.low,
        preset.glowIntensity.mid,
        preset.glowIntensity.peak,
        preset.glowIntensity.end,
      ),
      SAFE_RANGES.glowIntensity.min,
      SAFE_RANGES.glowIntensity.max,
    );

    const backgroundStrength = clamp(
      curve4(
        t,
        preset.backgroundStrength.low,
        preset.backgroundStrength.mid,
        preset.backgroundStrength.peak,
        preset.backgroundStrength.end,
      ),
      SAFE_RANGES.backgroundStrength.min,
      SAFE_RANGES.backgroundStrength.max,
    );

    const softness = clamp(
      curve4(
        t,
        preset.softness.low,
        preset.softness.mid,
        preset.softness.peak,
        preset.softness.end,
      ),
      SAFE_RANGES.softness.min,
      SAFE_RANGES.softness.max,
    );

    const wireOpacityMul = clamp(
      curve4(
        t,
        preset.wireOpacityMul.low,
        preset.wireOpacityMul.mid,
        preset.wireOpacityMul.peak,
        preset.wireOpacityMul.end,
      ),
      SAFE_RANGES.opacityMul.min,
      SAFE_RANGES.opacityMul.max,
    );

    const particlesOpacityMul = clamp(
      curve4(
        t,
        preset.particlesOpacityMul.low,
        preset.particlesOpacityMul.mid,
        preset.particlesOpacityMul.peak,
        preset.particlesOpacityMul.end,
      ),
      SAFE_RANGES.opacityMul.min,
      SAFE_RANGES.opacityMul.max,
    );

    const foregroundOpacity = clamp(
      curve4(
        t,
        preset.foregroundOpacityMul.low,
        preset.foregroundOpacityMul.mid,
        preset.foregroundOpacityMul.peak,
        preset.foregroundOpacityMul.end,
      ),
      SAFE_RANGES.foregroundOpacityMul.min,
      SAFE_RANGES.foregroundOpacityMul.max,
    );

    let fogColor = preset.colors.fog;
    let glowColor = preset.colors.glow;
    const bgColor = preset.colors.bg;

    const primary = parseColor(this.visualParams?.primary_color);
    if (primary != null) {
      fogColor = mixColor(fogColor, primary, 0.2);
      glowColor = mixColor(glowColor, primary, 0.25);
    }

    const smokeState = this.smokeRuntime.state;
    const smokeAlphaLayer = clamp(this.smokeRuntime.alphaLayer, 0, 1);
    const smokeSource = this.smokeRuntime.source;
    const smokeCompensation =
      this.smokeRuntime.compensation ??
      computeSmokeVisualCompensation(smokeState, smokeAlphaLayer);

    const compensatedFogDensity = clamp(
      fogDensity * smokeCompensation.fogDensityMultiplier,
      SAFE_RANGES.fogDensity.min,
      SAFE_RANGES.fogDensity.max,
    );

    const compensatedGlowIntensity = clamp(
      glowIntensity * smokeCompensation.glowIntensityMultiplier,
      SAFE_RANGES.glowIntensity.min,
      SAFE_RANGES.glowIntensity.max,
    );

    const compensatedBackgroundStrength = clamp(
      backgroundStrength * smokeCompensation.volumetricBackgroundMultiplier,
      SAFE_RANGES.backgroundStrength.min,
      SAFE_RANGES.backgroundStrength.max,
    );

    const opticsQualityProfile = this.resolveOpticsQualityProfile();

    const runtimeOpticsPolicy = resolveRuntimeOpticsPolicy({

      qualityProfile: opticsQualityProfile,

      ritualEnergy: t,

      ritualState: t,

      bloomRequested: {

        strength: bloomStrength,

        radius: bloomRadius,

        threshold: bloomThreshold,

      },

      iridescenceRequested: {

        intensity: compensatedGlowIntensity,

        hueShift: 0.08 * t,

        edgeBias: foregroundOpacity,

        temporalDrift: 0.04 * t,

      },

    });


    return {

      presetName: preset.name,

      bloomPolicy: runtimeOpticsPolicy.bloomPolicy,

      iridescencePolicy: runtimeOpticsPolicy.iridescencePolicy,
      fog: { enabled: true, density: compensatedFogDensity, color: fogColor },
      bloom: {
        strength: runtimeOpticsPolicy.bloomPolicy.strength,
        radius: runtimeOpticsPolicy.bloomPolicy.radius,
        threshold: runtimeOpticsPolicy.bloomPolicy.threshold,
      },
      volume: {
        glowIntensity: compensatedGlowIntensity,
        backgroundStrength: compensatedBackgroundStrength,
        softness,
        vignette: preset.vignette,
        bgColor,
        glowColor,
      },
      opacity: { wireOpacityMul, particlesOpacityMul, foregroundOpacity },
      smoke: {
        state: smokeState,
        alphaLayer: smokeAlphaLayer,
        source: smokeSource,
        compensation: smokeCompensation,
      },
    };
  }

  private smoothTargets(
    current: ClimateTargets,
    next: ClimateTargets,
    dtSec: number,
  ): ClimateTargets {
    const fogAlpha = alphaForSeconds(this.transitionSec.fog, dtSec);
    const bloomAlpha = alphaForSeconds(this.transitionSec.bloom, dtSec);
    const volumeAlpha = alphaForSeconds(this.transitionSec.volume, dtSec);
    const opacityAlpha = alphaForSeconds(this.transitionSec.opacity, dtSec);

    const currentForegroundOpacity =
      typeof current.opacity.foregroundOpacity === 'number' &&
      Number.isFinite(current.opacity.foregroundOpacity)
        ? current.opacity.foregroundOpacity
        : 1.0;

    const nextForegroundOpacity =
      typeof next.opacity.foregroundOpacity === 'number' &&
      Number.isFinite(next.opacity.foregroundOpacity)
        ? next.opacity.foregroundOpacity
        : 1.0;

    const hasForegroundOpacity =
      typeof current.opacity.foregroundOpacity === 'number' ||
      typeof next.opacity.foregroundOpacity === 'number';

    const currentSmoke = current.smoke ?? null;
    const nextSmoke = next.smoke ?? currentSmoke;

    return {
      presetName: next.presetName,
      ...(next.bloomPolicy ? { bloomPolicy: next.bloomPolicy } : {}),
      ...(next.iridescencePolicy
        ? { iridescencePolicy: next.iridescencePolicy }
        : {}),      fog: {
        enabled: next.fog.enabled,
        density: lerp(current.fog.density, next.fog.density, fogAlpha),
        color: mixColor(
          Number(current.fog.color),
          Number(next.fog.color),
          fogAlpha,
        ),
      },
      bloom: {
        strength: lerp(current.bloom.strength, next.bloom.strength, bloomAlpha),
        radius: lerp(current.bloom.radius, next.bloom.radius, bloomAlpha),
        threshold: lerp(
          current.bloom.threshold,
          next.bloom.threshold,
          bloomAlpha,
        ),
      },
      volume: {
        glowIntensity: lerp(
          current.volume.glowIntensity,
          next.volume.glowIntensity,
          volumeAlpha,
        ),
        backgroundStrength: lerp(
          current.volume.backgroundStrength,
          next.volume.backgroundStrength,
          volumeAlpha,
        ),
        softness: lerp(
          current.volume.softness,
          next.volume.softness,
          volumeAlpha,
        ),
        vignette: lerp(
          current.volume.vignette,
          next.volume.vignette,
          volumeAlpha,
        ),
        bgColor: mixColor(
          Number(current.volume.bgColor),
          Number(next.volume.bgColor),
          volumeAlpha,
        ),
        glowColor: mixColor(
          Number(current.volume.glowColor),
          Number(next.volume.glowColor),
          volumeAlpha,
        ),
      },
      opacity: {
        wireOpacityMul: lerp(
          current.opacity.wireOpacityMul,
          next.opacity.wireOpacityMul,
          opacityAlpha,
        ),
        particlesOpacityMul: lerp(
          current.opacity.particlesOpacityMul,
          next.opacity.particlesOpacityMul,
          opacityAlpha,
        ),
        foregroundOpacity: hasForegroundOpacity
          ? lerp(currentForegroundOpacity, nextForegroundOpacity, opacityAlpha)
          : undefined,
      },
      ...(nextSmoke
        ? {
            smoke: {
              state: nextSmoke.state,
              source: nextSmoke.source,
              alphaLayer: lerp(
                currentSmoke?.alphaLayer ?? nextSmoke.alphaLayer,
                nextSmoke.alphaLayer,
                opacityAlpha,
              ),
              compensation: {
                fogDensityMultiplier: lerp(
                  currentSmoke?.compensation?.fogDensityMultiplier ?? nextSmoke.compensation.fogDensityMultiplier,
                  nextSmoke.compensation.fogDensityMultiplier,
                  volumeAlpha,
                ),
                glowIntensityMultiplier: lerp(
                  currentSmoke?.compensation?.glowIntensityMultiplier ?? nextSmoke.compensation.glowIntensityMultiplier,
                  nextSmoke.compensation.glowIntensityMultiplier,
                  volumeAlpha,
                ),
                volumetricBackgroundMultiplier: lerp(
                  currentSmoke?.compensation?.volumetricBackgroundMultiplier ?? nextSmoke.compensation.volumetricBackgroundMultiplier,
                  nextSmoke.compensation.volumetricBackgroundMultiplier,
                  volumeAlpha,
                ),
                additiveAlphaMultiplier: lerp(
                  currentSmoke?.compensation?.additiveAlphaMultiplier ?? nextSmoke.compensation.additiveAlphaMultiplier,
                  nextSmoke.compensation.additiveAlphaMultiplier,
                  opacityAlpha,
                ),
              },
            },
          }
        : {}),
    };
  }

  private clampTargets(targets: ClimateTargets): ClimateTargets {
    const foregroundOpacity =
      typeof targets.opacity.foregroundOpacity === 'number'
        ? clamp(
            targets.opacity.foregroundOpacity,
            SAFE_RANGES.foregroundOpacityMul.min,
            SAFE_RANGES.foregroundOpacityMul.max,
          )
        : undefined;

    const smoke = targets.smoke;
    const clampedSmoke = smoke
      ? {
          state: smoke.state,
          source: smoke.source,
          alphaLayer: clamp(smoke.alphaLayer, 0, 1),
          compensation: {
            fogDensityMultiplier: clamp(smoke.compensation.fogDensityMultiplier, 0, 4),
            glowIntensityMultiplier: clamp(smoke.compensation.glowIntensityMultiplier, 0, 4),
            volumetricBackgroundMultiplier: clamp(smoke.compensation.volumetricBackgroundMultiplier, 0, 4),
            additiveAlphaMultiplier: clamp(smoke.compensation.additiveAlphaMultiplier, 0, 4),
          },
        }
      : undefined;

    return {
      presetName: targets.presetName,
      bloomPolicy: targets.bloomPolicy,
      iridescencePolicy: targets.iridescencePolicy,
      fog: {
        enabled: targets.fog.enabled,
        density: clamp(
          targets.fog.density,
          SAFE_RANGES.fogDensity.min,
          SAFE_RANGES.fogDensity.max,
        ),
        color: targets.fog.color,
      },
      bloom: {
        strength: clamp(
          targets.bloom.strength,
          SAFE_RANGES.bloomStrength.min,
          SAFE_RANGES.bloomStrength.max,
        ),
        radius: clamp(
          targets.bloom.radius,
          SAFE_RANGES.bloomRadius.min,
          SAFE_RANGES.bloomRadius.max,
        ),
        threshold: clamp(
          targets.bloom.threshold,
          SAFE_RANGES.bloomThreshold.min,
          SAFE_RANGES.bloomThreshold.max,
        ),
      },
      volume: {
        glowIntensity: clamp(
          targets.volume.glowIntensity,
          SAFE_RANGES.glowIntensity.min,
          SAFE_RANGES.glowIntensity.max,
        ),
        backgroundStrength: clamp(
          targets.volume.backgroundStrength,
          SAFE_RANGES.backgroundStrength.min,
          SAFE_RANGES.backgroundStrength.max,
        ),
        softness: clamp(
          targets.volume.softness,
          SAFE_RANGES.softness.min,
          SAFE_RANGES.softness.max,
        ),
        vignette: targets.volume.vignette,
        bgColor: targets.volume.bgColor,
        glowColor: targets.volume.glowColor,
      },
      opacity: {
        wireOpacityMul: clamp(
          targets.opacity.wireOpacityMul,
          SAFE_RANGES.opacityMul.min,
          SAFE_RANGES.opacityMul.max,
        ),
        particlesOpacityMul: clamp(
          targets.opacity.particlesOpacityMul,
          SAFE_RANGES.opacityMul.min,
          SAFE_RANGES.opacityMul.max,
        ),
        ...(typeof foregroundOpacity === 'number' ? { foregroundOpacity } : {}),
      },
      ...(clampedSmoke ? { smoke: clampedSmoke } : {}),
    };
  }

  private logStatus(targets: ClimateTargets) {
    if (!this.shouldLog()) return;

    const now = Date.now();
    if (now - this.lastLogMs < 1000) return;
    this.lastLogMs = now;

    const b = targets.bloom;
    const msg =
      `preset=${targets.presetName} ` +
      `fog=${targets.fog.density.toFixed(4)} ` +
      `bloom=(${b.strength.toFixed(2)},${b.radius.toFixed(2)},${b.threshold.toFixed(2)}) ` +
      `glow=${targets.volume.glowIntensity.toFixed(2)} ` +
      `bg=${targets.volume.backgroundStrength.toFixed(2)} ` +
      `dtMs=${this.runtimeTelemetry.lastDtMs ?? 'null'} ` +
      `progress=${this.runtimeTelemetry.lastProgress.toFixed(3)} ` +
      `updates=${this.runtimeTelemetry.updateCount} ` +
      `targetsVersion=${this.runtimeTelemetry.targetsVersion}`;

    orbLog('Climate', msg, {
      audit: true,
      key: 'climate:status',
      throttleMs: 1000,
    });
  }

  private shouldLog() {
    if (this.debug) return true;
    try {
      return (
        typeof import.meta !== 'undefined' && !!(import.meta as any).env?.DEV
      );
    } catch {
      return false;
    }
  }
}
