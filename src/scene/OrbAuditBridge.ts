import * as THREE from 'three';

declare global {
  interface Window {
    __ORB_AUDIT__?: Record<string, any>;
    __ORB_AUDIT_READY__?: boolean;
  }
}

type OrbAuditRoot = Record<string, any>;

type QualityProfilesTelemetry = {
  current: string | null;
  active: string | null;
  forced: string | null;
  source: 'forced' | 'auto-detected' | 'fallback' | 'unknown';
  reason: string | null;
  estimatedCost: number | null;
  dprBucket: 'normal' | 'high' | 'ultra';
  deviceClass: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  rendererArea: number | null;
};

type TimingDiagnostics = {
  bootElapsedMs: number;
  isWarmup: boolean;
  warmupPhase: 'boot' | 'warming' | 'steady';
  dominantTimingKey: string | null;
  dominantTimingMs: number | null;
  recentRebuilds: {
    geometry: boolean;
    fluid: boolean;
    materials: boolean;
  };
};

function createEmptyQualityProfiles(): QualityProfilesTelemetry {
  return {
    current: 'unknown',
    active: 'unknown',
    forced: null,
    source: 'unknown',
    reason: null,
    estimatedCost: null,
    dprBucket: 'normal',
    deviceClass: 'unknown',
    rendererArea: null,
  };
}

function createEmptyTimingDiagnostics(): TimingDiagnostics {
  return {
    bootElapsedMs: 0,
    isWarmup: true,
    warmupPhase: 'boot',
    dominantTimingKey: null,
    dominantTimingMs: null,
    recentRebuilds: {
      geometry: false,
      fluid: false,
      materials: false,
    },
  };
}

function createBaseAuditContract(): OrbAuditRoot {
  return {
    timestamp: Date.now(),
    activeQualityProfile: 'unknown',
    forcedQualityProfile: null,
    qualityProfileSource: 'unknown',
    qualityProfileReason: null,
    dprBucket: 'normal',
    deviceClass: 'unknown',
    rendererArea: null,
    qualityProfiles: createEmptyQualityProfiles(),
    timingDiagnostics: createEmptyTimingDiagnostics(),
    invariants: {
      optics: {
        volumeBackgroundDepthWrite: false,
        volumeGlowDepthWrite: false,
        volumeGlowIsAdditive: true,
        particlesPointsDepthWrite: false,
        particlesLinksDepthWrite: false,
        particlesTrailsDepthWrite: false,
        fluidParticlesDepthWrite: false,
      },
      scene: {
        isEmergencyMode: false,
        particlesMode: 'points',
      },
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeShallowObject(
  baseValue: Record<string, any> | undefined,
  patchValue: Record<string, any> | undefined,
): Record<string, any> {
  return {
    ...(baseValue || {}),
    ...(patchValue || {}),
  };
}

function normalizeFiniteNumber(
  value: unknown,
  fallback: number | null = null,
): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeString(
  value: unknown,
  fallback: string | null = null,
): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function resolveQualityProfiles(ctx: any): QualityProfilesTelemetry {
  const fromCtx = isPlainObject(ctx?.qualityProfiles)
    ? ctx.qualityProfiles
    : {};
  const fromRuntime = isPlainObject(ctx?.runtimeTelemetry?.qualityProfiles)
    ? ctx.runtimeTelemetry.qualityProfiles
    : {};

  const current =
    normalizeString(ctx?.qualityProfile) ??
    normalizeString(ctx?.activeQualityProfile) ??
    normalizeString(fromCtx.current) ??
    normalizeString(fromCtx.active) ??
    normalizeString(fromRuntime.current) ??
    normalizeString(fromRuntime.active) ??
    'unknown';

  const active =
    normalizeString(ctx?.activeQualityProfile) ??
    normalizeString(fromCtx.active) ??
    normalizeString(fromRuntime.active) ??
    current;

  const forced =
    normalizeString(ctx?.forcedQualityProfile) ??
    normalizeString(fromCtx.forced) ??
    normalizeString(fromRuntime.forced) ??
    null;

  const source =
    (normalizeString(ctx?.qualityProfileSource) as
      | QualityProfilesTelemetry['source']
      | null) ??
    (normalizeString(fromCtx.source) as
      | QualityProfilesTelemetry['source']
      | null) ??
    (normalizeString(fromRuntime.source) as
      | QualityProfilesTelemetry['source']
      | null) ??
    (forced ? 'forced' : active !== 'unknown' ? 'auto-detected' : 'unknown');

  const reason =
    normalizeString(ctx?.qualityProfileReason) ??
    normalizeString(fromCtx.reason) ??
    normalizeString(fromRuntime.reason) ??
    null;

  const estimatedCost =
    normalizeFiniteNumber(fromCtx.estimatedCost, null) ??
    normalizeFiniteNumber(fromRuntime.estimatedCost, null);

  const dprBucket =
    (normalizeString(ctx?.dprBucket) as
      | QualityProfilesTelemetry['dprBucket']
      | null) ??
    (normalizeString(fromCtx.dprBucket) as
      | QualityProfilesTelemetry['dprBucket']
      | null) ??
    (normalizeString(fromRuntime.dprBucket) as
      | QualityProfilesTelemetry['dprBucket']
      | null) ??
    'normal';

  const deviceClass =
    (normalizeString(ctx?.deviceClass) as
      | QualityProfilesTelemetry['deviceClass']
      | null) ??
    (normalizeString(fromCtx.deviceClass) as
      | QualityProfilesTelemetry['deviceClass']
      | null) ??
    (normalizeString(fromRuntime.deviceClass) as
      | QualityProfilesTelemetry['deviceClass']
      | null) ??
    'unknown';

  const rendererArea =
    normalizeFiniteNumber(ctx?.rendererArea, null) ??
    normalizeFiniteNumber(fromCtx.rendererArea, null) ??
    normalizeFiniteNumber(fromRuntime.rendererArea, null);

  return {
    current,
    active,
    forced,
    source,
    reason,
    estimatedCost,
    dprBucket,
    deviceClass,
    rendererArea,
  };
}

function resolveTimingDiagnostics(ctx: any): TimingDiagnostics {
  const fromCtx = isPlainObject(ctx?.timingDiagnostics)
    ? ctx.timingDiagnostics
    : {};
  const fromRuntime = isPlainObject(ctx?.runtimeTelemetry?.timingDiagnostics)
    ? ctx.runtimeTelemetry.timingDiagnostics
    : {};

  const recentCtx = isPlainObject(fromCtx.recentRebuilds)
    ? fromCtx.recentRebuilds
    : {};
  const recentRuntime = isPlainObject(fromRuntime.recentRebuilds)
    ? fromRuntime.recentRebuilds
    : {};

  return {
    bootElapsedMs:
      normalizeFiniteNumber(fromCtx.bootElapsedMs, null) ??
      normalizeFiniteNumber(fromRuntime.bootElapsedMs, null) ??
      0,
    isWarmup:
      typeof fromCtx.isWarmup === 'boolean'
        ? fromCtx.isWarmup
        : typeof fromRuntime.isWarmup === 'boolean'
          ? fromRuntime.isWarmup
          : true,
    warmupPhase:
      (normalizeString(fromCtx.warmupPhase) as
        | TimingDiagnostics['warmupPhase']
        | null) ??
      (normalizeString(fromRuntime.warmupPhase) as
        | TimingDiagnostics['warmupPhase']
        | null) ??
      'boot',
    dominantTimingKey:
      normalizeString(fromCtx.dominantTimingKey) ??
      normalizeString(fromRuntime.dominantTimingKey) ??
      null,
    dominantTimingMs:
      normalizeFiniteNumber(fromCtx.dominantTimingMs, null) ??
      normalizeFiniteNumber(fromRuntime.dominantTimingMs, null),
    recentRebuilds: {
      geometry:
        typeof recentCtx.geometry === 'boolean'
          ? recentCtx.geometry
          : normalizeBoolean(recentRuntime.geometry, false),
      fluid:
        typeof recentCtx.fluid === 'boolean'
          ? recentCtx.fluid
          : normalizeBoolean(recentRuntime.fluid, false),
      materials:
        typeof recentCtx.materials === 'boolean'
          ? recentCtx.materials
          : normalizeBoolean(recentRuntime.materials, false),
    },
  };
}

function ensureAuditRoot(): OrbAuditRoot | null {
  if (typeof window === 'undefined') return null;

  const existing = window.__ORB_AUDIT__;
  const base = createBaseAuditContract();

  if (!isPlainObject(existing)) {
    window.__ORB_AUDIT__ = base;
    return window.__ORB_AUDIT__;
  }

  window.__ORB_AUDIT__ = {
    ...base,
    ...existing,
    qualityProfiles: {
      ...base.qualityProfiles,
      ...(isPlainObject(existing.qualityProfiles)
        ? existing.qualityProfiles
        : {}),
    },
    timingDiagnostics: {
      ...base.timingDiagnostics,
      ...(isPlainObject(existing.timingDiagnostics)
        ? existing.timingDiagnostics
        : {}),
      recentRebuilds: {
        ...base.timingDiagnostics.recentRebuilds,
        ...(isPlainObject(existing.timingDiagnostics?.recentRebuilds)
          ? existing.timingDiagnostics.recentRebuilds
          : {}),
      },
    },
    invariants: {
      ...base.invariants,
      ...(isPlainObject(existing.invariants) ? existing.invariants : {}),
      optics: mergeShallowObject(
        base.invariants.optics,
        isPlainObject(existing.invariants?.optics)
          ? existing.invariants.optics
          : undefined,
      ),
      scene: mergeShallowObject(
        base.invariants.scene,
        isPlainObject(existing.invariants?.scene)
          ? existing.invariants.scene
          : undefined,
      ),
    },
  };

  return window.__ORB_AUDIT__;
}

function readDepthWrite(material: THREE.Material | undefined): boolean {
  return material?.depthWrite ?? false;
}

function readAdditive(material: THREE.Material | undefined): boolean {
  return material ? material.blending === THREE.AdditiveBlending : true;
}

function resolveFluidMaterial(ctx: any): THREE.Material | undefined {
  return (ctx?.fluidParticlesState?.mesh?.material ||
    ctx?.fluidParticlesMesh?.material ||
    ctx?.fluidParticles?.material) as THREE.Material | undefined;
}

function resolveParticlesMode(ctx: any): string {
  const mode = ctx?.particlesConfig?.mode;
  return typeof mode === 'string' && mode.trim().length > 0 ? mode : 'points';
}

export class OrbAuditBridge {
  static ensureInitialized(): void {
    ensureAuditRoot();
  }

  static captureRuntimeState(ctx: any): void {
    if (typeof window === 'undefined') return;
    if (!ctx) {
      ensureAuditRoot();
      return;
    }

    const root = ensureAuditRoot();
    if (!root) return;

    const bgMat = ctx.volumeState?.backgroundMaterial as
      | THREE.Material
      | undefined;
    const glowMat = ctx.volumeState?.glowMaterial as THREE.Material | undefined;
    const ptMat = ctx.particlesPoints?.material as THREE.Material | undefined;
    const lkMat = ctx.particlesLinks?.material as THREE.Material | undefined;
    const trMat = ctx.particlesTrails?.material as THREE.Material | undefined;
    const fluidMat = resolveFluidMaterial(ctx);

    const nextInvariants = {
      optics: {
        volumeBackgroundDepthWrite: readDepthWrite(bgMat),
        volumeGlowDepthWrite: readDepthWrite(glowMat),
        volumeGlowIsAdditive: readAdditive(glowMat),
        particlesPointsDepthWrite: readDepthWrite(ptMat),
        particlesLinksDepthWrite: readDepthWrite(lkMat),
        particlesTrailsDepthWrite: readDepthWrite(trMat),
        fluidParticlesDepthWrite: readDepthWrite(fluidMat),
      },
      scene: {
        isEmergencyMode: !!ctx.runtimeFlags?.emergencyMode,
        particlesMode: resolveParticlesMode(ctx),
      },
    };

    const qualityProfiles = resolveQualityProfiles(ctx);
    const timingDiagnostics = resolveTimingDiagnostics(ctx);

    window.__ORB_AUDIT__ = {
      ...root,
      timestamp: Date.now(),
      activeQualityProfile: qualityProfiles.active,
      forcedQualityProfile: qualityProfiles.forced,
      qualityProfileSource: qualityProfiles.source,
      qualityProfileReason: qualityProfiles.reason,
      dprBucket: qualityProfiles.dprBucket,
      deviceClass: qualityProfiles.deviceClass,
      rendererArea: qualityProfiles.rendererArea,
      qualityProfiles: {
        ...(isPlainObject(root.qualityProfiles) ? root.qualityProfiles : {}),
        ...qualityProfiles,
      },
      timingDiagnostics: {
        ...(isPlainObject(root.timingDiagnostics)
          ? root.timingDiagnostics
          : {}),
        ...timingDiagnostics,
        recentRebuilds: {
          ...(isPlainObject(root.timingDiagnostics?.recentRebuilds)
            ? root.timingDiagnostics.recentRebuilds
            : {}),
          ...timingDiagnostics.recentRebuilds,
        },
      },
      invariants: {
        ...(isPlainObject(root.invariants) ? root.invariants : {}),
        optics: mergeShallowObject(
          isPlainObject(root.invariants?.optics)
            ? root.invariants.optics
            : undefined,
          nextInvariants.optics,
        ),
        scene: mergeShallowObject(
          isPlainObject(root.invariants?.scene)
            ? root.invariants.scene
            : undefined,
          nextInvariants.scene,
        ),
      },
    };
  }
}

OrbAuditBridge.ensureInitialized();
