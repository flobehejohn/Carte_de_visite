export const QUALITY_PROFILE_NAMES = ['safe', 'low', 'medium', 'high', 'ultra'] as const;

export type QualityProfileName = (typeof QUALITY_PROFILE_NAMES)[number];
export type QualitySource = 'forced' | 'auto-detect' | 'runtime-budget';

export interface QualityProfile {
  name: QualityProfileName;
  maxDpr: number;
  bloomEnabled: boolean;
  bloomStrengthMax: number;
  fogDensityCeiling: number;
  smokeAlphaLayer: number;
  fluidParticleCount: number;
  fluidUpdateRate: number;
  shadowMapEnabled: boolean;
  shadowMapResolution: number;
  volumetricBackgroundStrength: number;
  glowIntensityMax: number;
  text3DEnabled: boolean;
  partialUpdateDivisors: {
    fluid: number;
    lighting: number;
    volumes: number;
    text: number;
  };
}

export interface DeviceHints {
  devicePixelRatio?: number;
  isMobile?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface FrameMetrics {
  totalUpdateMs?: number;
  fluidMs?: number;
  geometryMs?: number;
  volumeMs?: number;
  textMs?: number;
  activeShadowCasters?: number;
  hasUsefulShadowCaster?: boolean;
  frameIndex?: number;
}

export interface BudgetSnapshot {
  targetFrameMs: number;
  lastFrameMs: number | null;
  overloadRatio: number | null;
}

export interface HysteresisSnapshot {
  badFrameCount: number;
  goodFrameCount: number;
  cooldownFramesRemaining: number;
  downgradeAfterFrames: number;
  upgradeAfterFrames: number;
  cooldownFrames: number;
}

export interface QualitySnapshot {
  activeProfile: QualityProfileName;
  forcedProfile: QualityProfileName | null;
  autoDetectedProfile: QualityProfileName;
  source: QualitySource;
  estimatedCost: number;
  budget: BudgetSnapshot;
  hysteresis: HysteresisSnapshot;
  profile: QualityProfile;
}

export interface QualityGovernorOptions extends DeviceHints {
  initialProfile?: QualityProfileName;
  forcedProfile?: QualityProfileName | null;
  downgradeAfterFrames?: number;
  upgradeAfterFrames?: number;
  cooldownFrames?: number;
  mobileFrameBudgetMs?: number;
  desktopFrameBudgetMs?: number;
}

type MutableContextLike = Record<string, any>;

const PROFILE_ORDER: Record<QualityProfileName, number> = {
  safe: 0,
  low: 1,
  medium: 2,
  high: 3,
  ultra: 4,
};

export const QUALITY_PROFILES: Record<QualityProfileName, QualityProfile> = {
  safe: Object.freeze({
    name: 'safe',
    maxDpr: 1.0,
    bloomEnabled: false,
    bloomStrengthMax: 0,
    fogDensityCeiling: 0.006,
    smokeAlphaLayer: 0.04,
    fluidParticleCount: 0,
    fluidUpdateRate: 1,
    shadowMapEnabled: false,
    shadowMapResolution: 0,
    volumetricBackgroundStrength: 0.08,
    glowIntensityMax: 0.22,
    text3DEnabled: false,
    partialUpdateDivisors: Object.freeze({
      fluid: 1,
      lighting: 3,
      volumes: 4,
      text: 4,
    }),
  }),
  low: Object.freeze({
    name: 'low',
    maxDpr: 1.15,
    bloomEnabled: false,
    bloomStrengthMax: 0,
    fogDensityCeiling: 0.01,
    smokeAlphaLayer: 0.065,
    fluidParticleCount: 320,
    fluidUpdateRate: 1,
    shadowMapEnabled: false,
    shadowMapResolution: 0,
    volumetricBackgroundStrength: 0.18,
    glowIntensityMax: 0.42,
    text3DEnabled: false,
    partialUpdateDivisors: Object.freeze({
      fluid: 1,
      lighting: 2,
      volumes: 3,
      text: 3,
    }),
  }),
  medium: Object.freeze({
    name: 'medium',
    maxDpr: 1.35,
    bloomEnabled: true,
    bloomStrengthMax: 0.55,
    fogDensityCeiling: 0.014,
    smokeAlphaLayer: 0.09,
    fluidParticleCount: 720,
    fluidUpdateRate: 1,
    shadowMapEnabled: true,
    shadowMapResolution: 768,
    volumetricBackgroundStrength: 0.4,
    glowIntensityMax: 0.72,
    text3DEnabled: true,
    partialUpdateDivisors: Object.freeze({
      fluid: 1,
      lighting: 2,
      volumes: 2,
      text: 2,
    }),
  }),
  high: Object.freeze({
    name: 'high',
    maxDpr: 1.65,
    bloomEnabled: true,
    bloomStrengthMax: 0.9,
    fogDensityCeiling: 0.018,
    smokeAlphaLayer: 0.13,
    fluidParticleCount: 1280,
    fluidUpdateRate: 1,
    shadowMapEnabled: true,
    shadowMapResolution: 1024,
    volumetricBackgroundStrength: 0.7,
    glowIntensityMax: 1.0,
    text3DEnabled: true,
    partialUpdateDivisors: Object.freeze({
      fluid: 1,
      lighting: 1,
      volumes: 1,
      text: 1,
    }),
  }),
  ultra: Object.freeze({
    name: 'ultra',
    maxDpr: 2.0,
    bloomEnabled: true,
    bloomStrengthMax: 1.2,
    fogDensityCeiling: 0.022,
    smokeAlphaLayer: 0.18,
    fluidParticleCount: 2200,
    fluidUpdateRate: 1,
    shadowMapEnabled: true,
    shadowMapResolution: 2048,
    volumetricBackgroundStrength: 1.0,
    glowIntensityMax: 1.24,
    text3DEnabled: true,
    partialUpdateDivisors: Object.freeze({
      fluid: 1,
      lighting: 1,
      volumes: 1,
      text: 1,
    }),
  }),
};

function clampProfileName(input?: QualityProfileName | null): QualityProfileName {
  if (input && QUALITY_PROFILE_NAMES.includes(input)) {
    return input;
  }

  return 'high';
}

function lowerProfile(name: QualityProfileName): QualityProfileName {
  const nextRank = Math.max(0, PROFILE_ORDER[name] - 1);
  return QUALITY_PROFILE_NAMES[nextRank];
}

function higherProfile(name: QualityProfileName): QualityProfileName {
  const nextRank = Math.min(QUALITY_PROFILE_NAMES.length - 1, PROFILE_ORDER[name] + 1);
  return QUALITY_PROFILE_NAMES[nextRank];
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function resolveShadowMapEnabled(
  requested: boolean,
  usefulShadowCaster: boolean | number,
): boolean {
  const hasUsefulCaster =
    typeof usefulShadowCaster === 'number' ? usefulShadowCaster > 0 : Boolean(usefulShadowCaster);

  return Boolean(requested && hasUsefulCaster);
}

export function detectQualityProfileFromDevice(hints: DeviceHints = {}): QualityProfileName {
  const dpr = hints.devicePixelRatio ?? 1;
  const width = hints.viewportWidth ?? 1440;
  const height = hints.viewportHeight ?? 900;
  const minSide = Math.min(width, height);
  const isMobile = hints.isMobile ?? (width <= 768 || minSide <= 480);

  if (isMobile) {
    if (dpr >= 3) return 'low';
    if (dpr >= 2) return 'medium';
    return 'medium';
  }

  if (dpr >= 2.5) return 'medium';
  if (dpr >= 1.75) return 'high';
  return 'ultra';
}

export function estimateProfileCost(profile: QualityProfile): number {
  const ultra = QUALITY_PROFILES.ultra;

  let score = 0;
  score += (profile.maxDpr / ultra.maxDpr) * 15;
  score += profile.bloomEnabled ? 10 : 0;
  score += ultra.bloomStrengthMax > 0 ? (profile.bloomStrengthMax / ultra.bloomStrengthMax) * 8 : 0;
  score += ultra.fogDensityCeiling > 0 ? (profile.fogDensityCeiling / ultra.fogDensityCeiling) * 6 : 0;
  score += ultra.smokeAlphaLayer > 0 ? (profile.smokeAlphaLayer / ultra.smokeAlphaLayer) * 5 : 0;
  score += ultra.fluidParticleCount > 0 ? (profile.fluidParticleCount / ultra.fluidParticleCount) * 18 : 0;
  score += ultra.shadowMapResolution > 0 ? (profile.shadowMapResolution / ultra.shadowMapResolution) * 14 : 0;
  score += ultra.volumetricBackgroundStrength > 0
    ? (profile.volumetricBackgroundStrength / ultra.volumetricBackgroundStrength) * 10
    : 0;
  score += ultra.glowIntensityMax > 0 ? (profile.glowIntensityMax / ultra.glowIntensityMax) * 8 : 0;
  score += profile.text3DEnabled ? 6 : 0;

  return round(score, 2);
}

export function getQualityProfileByName(name?: QualityProfileName | null): QualityProfile {
  return QUALITY_PROFILES[clampProfileName(name)];
}

export function getQualityProfileFromContext(
  ctx: Record<string, any> | null | undefined,
  fallback: QualityProfileName = 'high',
): QualityProfile {
  const profileName =
    ctx?.runtime?.quality?.activeProfile ??
    ctx?.qualityProfileName ??
    ctx?.qualityProfile ??
    ctx?.qualityGovernor?.getActiveProfileName?.() ??
    fallback;

  return getQualityProfileByName(profileName);
}

export function writeQualitySnapshotToContext(
  ctx: MutableContextLike,
  governor: QualityGovernor,
): QualitySnapshot {
  if (!ctx.runtime) {
    ctx.runtime = {};
  }

  const snapshot = governor.getSnapshot();

  ctx.runtime.quality = snapshot;
  ctx.runtime.qualityProfileName = snapshot.activeProfile;
  ctx.runtime.qualitySource = snapshot.source;
  ctx.runtime.qualityForcedProfile = snapshot.forcedProfile;
  ctx.runtime.qualityEstimatedCost = snapshot.estimatedCost;
  ctx.runtime.qualityProfile = snapshot.profile;

  ctx.qualityProfile = snapshot.activeProfile;
  ctx.qualityProfileName = snapshot.activeProfile;
  ctx.activeQualityProfile = snapshot.activeProfile;
  ctx.forcedQualityProfile = snapshot.forcedProfile;
  ctx.autoDetectedQualityProfile = snapshot.autoDetectedProfile;
  ctx.qualityProfileSource = snapshot.source;
  ctx.estimatedProfileCost = snapshot.estimatedCost;
  ctx.qualityGovernor = governor;

  return snapshot;
}

export class QualityGovernor {
  private forcedProfile: QualityProfileName | null;
  private activeProfile: QualityProfileName;
  private autoDetectedProfile: QualityProfileName;
  private source: QualitySource;
  private readonly downgradeAfterFrames: number;
  private readonly upgradeAfterFrames: number;
  private readonly cooldownFrames: number;
  private readonly mobileFrameBudgetMs: number;
  private readonly desktopFrameBudgetMs: number;
  private readonly deviceHints: Required<DeviceHints>;
  private badFrameCount = 0;
  private goodFrameCount = 0;
  private cooldownFramesRemaining = 0;
  private lastFrameMs: number | null = null;
  private overloadRatio: number | null = null;
  private lastEstimatedCost = 0;

  constructor(options: QualityGovernorOptions = {}) {
    this.deviceHints = {
      devicePixelRatio: options.devicePixelRatio ?? 1,
      isMobile: options.isMobile ?? false,
      viewportWidth: options.viewportWidth ?? 1440,
      viewportHeight: options.viewportHeight ?? 900,
    };

    this.autoDetectedProfile = detectQualityProfileFromDevice(this.deviceHints);
    this.forcedProfile = options.forcedProfile ?? null;
    this.activeProfile = clampProfileName(options.initialProfile ?? this.autoDetectedProfile);
    this.source = this.forcedProfile ? 'forced' : 'auto-detect';

    if (this.forcedProfile) {
      this.activeProfile = this.forcedProfile;
    }

    this.downgradeAfterFrames = Math.max(1, options.downgradeAfterFrames ?? 3);
    this.upgradeAfterFrames = Math.max(1, options.upgradeAfterFrames ?? 8);
    this.cooldownFrames = Math.max(0, options.cooldownFrames ?? 4);
    this.mobileFrameBudgetMs = Math.max(1, options.mobileFrameBudgetMs ?? 22);
    this.desktopFrameBudgetMs = Math.max(1, options.desktopFrameBudgetMs ?? 16.7);

    this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
  }

  getActiveProfile(): QualityProfile {
    return QUALITY_PROFILES[this.activeProfile];
  }

  getActiveProfileName(): QualityProfileName {
    return this.activeProfile;
  }

  getForcedProfileName(): QualityProfileName | null {
    return this.forcedProfile;
  }

  getAutoDetectedProfileName(): QualityProfileName {
    return this.autoDetectedProfile;
  }

  setForcedProfile(profile: QualityProfileName | null): QualitySnapshot {
    this.forcedProfile = profile;

    if (profile) {
      this.activeProfile = profile;
      this.source = 'forced';
      this.resetHysteresis();
    } else {
      this.activeProfile = this.autoDetectedProfile;
      this.source = 'auto-detect';
      this.resetHysteresis();
    }

    this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
    return this.getSnapshot();
  }

  setDeviceHints(hints: DeviceHints): QualitySnapshot {
    this.deviceHints.devicePixelRatio = hints.devicePixelRatio ?? this.deviceHints.devicePixelRatio;
    this.deviceHints.isMobile = hints.isMobile ?? this.deviceHints.isMobile;
    this.deviceHints.viewportWidth = hints.viewportWidth ?? this.deviceHints.viewportWidth;
    this.deviceHints.viewportHeight = hints.viewportHeight ?? this.deviceHints.viewportHeight;

    this.autoDetectedProfile = detectQualityProfileFromDevice(this.deviceHints);

    if (!this.forcedProfile && this.source === 'auto-detect') {
      this.activeProfile = this.autoDetectedProfile;
      this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
    }

    return this.getSnapshot();
  }

  resetToAutoDetected(): QualitySnapshot {
    this.forcedProfile = null;
    this.activeProfile = this.autoDetectedProfile;
    this.source = 'auto-detect';
    this.resetHysteresis();
    this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
    return this.getSnapshot();
  }

  observe(metrics: FrameMetrics = {}): QualitySnapshot {
    const targetFrameMs = this.getTargetFrameMs();
    const totalUpdateMs = metrics.totalUpdateMs ?? 0;
    const fluidMs = metrics.fluidMs ?? 0;
    const geometryMs = metrics.geometryMs ?? 0;
    const volumeMs = metrics.volumeMs ?? 0;
    const textMs = metrics.textMs ?? 0;

    this.lastFrameMs = totalUpdateMs;
    this.overloadRatio = targetFrameMs > 0 ? round(totalUpdateMs / targetFrameMs, 3) : null;

    const runtimeScore = round(
      Math.max(
        estimateProfileCost(this.getActiveProfile()),
        (totalUpdateMs / targetFrameMs) * 100,
        (fluidMs / Math.max(1, targetFrameMs * 0.45)) * 18,
        (geometryMs / Math.max(1, targetFrameMs * 0.4)) * 14,
        (volumeMs / Math.max(1, targetFrameMs * 0.35)) * 14,
        (textMs / Math.max(1, targetFrameMs * 0.2)) * 10,
      ),
      2,
    );

    this.lastEstimatedCost = runtimeScore;

    if (this.forcedProfile) {
      this.activeProfile = this.forcedProfile;
      this.source = 'forced';
      this.tickCooldown();
      return this.getSnapshot();
    }

    const badFrame =
      totalUpdateMs > targetFrameMs * 1.08 ||
      fluidMs > targetFrameMs * 0.5 ||
      geometryMs > targetFrameMs * 0.45 ||
      volumeMs > targetFrameMs * 0.42 ||
      textMs > targetFrameMs * 0.25;

    const goodFrame =
      totalUpdateMs > 0 &&
      totalUpdateMs < targetFrameMs * 0.72 &&
      fluidMs < targetFrameMs * 0.28 &&
      geometryMs < targetFrameMs * 0.22 &&
      volumeMs < targetFrameMs * 0.2 &&
      textMs < targetFrameMs * 0.12;

    if (badFrame) {
      this.badFrameCount += 1;
      this.goodFrameCount = 0;
    } else if (goodFrame) {
      this.goodFrameCount += 1;
      this.badFrameCount = 0;
    } else {
      this.badFrameCount = 0;
      this.goodFrameCount = 0;
    }

    if (this.cooldownFramesRemaining > 0) {
      this.badFrameCount = 0;
      this.goodFrameCount = 0;
      this.tickCooldown();
      return this.getSnapshot();
    }

    if (this.badFrameCount >= this.downgradeAfterFrames) {
      const next = lowerProfile(this.activeProfile);
      if (next !== this.activeProfile) {
        this.activeProfile = next;
        this.source = 'runtime-budget';
        this.badFrameCount = 0;
        this.goodFrameCount = 0;
        this.cooldownFramesRemaining = this.cooldownFrames;
        this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
      }
      return this.getSnapshot();
    }

    if (this.goodFrameCount >= this.upgradeAfterFrames) {
      const next = higherProfile(this.activeProfile);
      if (next !== this.activeProfile) {
        this.activeProfile = next;
        this.source = 'runtime-budget';
        this.badFrameCount = 0;
        this.goodFrameCount = 0;
        this.cooldownFramesRemaining = this.cooldownFrames;
        this.lastEstimatedCost = estimateProfileCost(this.getActiveProfile());
      }
      return this.getSnapshot();
    }

    return this.getSnapshot();
  }

  getSnapshot(): QualitySnapshot {
    return {
      activeProfile: this.activeProfile,
      forcedProfile: this.forcedProfile,
      autoDetectedProfile: this.autoDetectedProfile,
      source: this.source,
      estimatedCost: this.lastEstimatedCost || estimateProfileCost(this.getActiveProfile()),
      budget: {
        targetFrameMs: this.getTargetFrameMs(),
        lastFrameMs: this.lastFrameMs,
        overloadRatio: this.overloadRatio,
      },
      hysteresis: {
        badFrameCount: this.badFrameCount,
        goodFrameCount: this.goodFrameCount,
        cooldownFramesRemaining: this.cooldownFramesRemaining,
        downgradeAfterFrames: this.downgradeAfterFrames,
        upgradeAfterFrames: this.upgradeAfterFrames,
        cooldownFrames: this.cooldownFrames,
      },
      profile: this.getActiveProfile(),
    };
  }

  private getTargetFrameMs(): number {
    return this.deviceHints.isMobile ? this.mobileFrameBudgetMs : this.desktopFrameBudgetMs;
  }

  private resetHysteresis(): void {
    this.badFrameCount = 0;
    this.goodFrameCount = 0;
    this.cooldownFramesRemaining = 0;
  }

  private tickCooldown(): void {
    if (this.cooldownFramesRemaining > 0) {
      this.cooldownFramesRemaining -= 1;
    }
  }
}
