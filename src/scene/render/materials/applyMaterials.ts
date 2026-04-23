import {
  clamp,
  computeAlphaInPlace,
  computeTransparencyPolicy,
  computeSmokeVisualCompensation,
  isFiniteNumber,
  type MaterialTransparencyPolicy,
  type TransparencyOptions,
  type TransparencyState,
  type SmokePolicyState,
  type SmokeVisualCompensation,
} from '../optics/transparency';
import type { RenderParams } from './materialParams';

type MaterialLike = {
  opacity?: number;
  transparent?: boolean;
  depthWrite?: boolean;
  depthTest?: boolean;
  renderOrder?: number;
  dithering?: boolean;
  alphaTest?: number;
  alphaHash?: boolean;
  blending?: number;
  userData?: {
    opacityBase?: number;
    smokeSensitive?: boolean;
    additiveAlphaMultiplier?: number;
  };
};

type MaterialHost = { material?: MaterialLike | MaterialLike[] | null };

type RenderMaterialContext = {
  wireFrames?: MaterialHost[];
  particlesPoints?: MaterialHost;
  particlesTrails?: MaterialHost;
  particlesLinks?: MaterialHost;
  foregroundMesh?: MaterialHost;
  particlesConfig?: { opacity?: number };
  smokePolicyState?: SmokePolicyState;
  smokeAlphaLayer?: number | null;
  smokeCompensation?: SmokeVisualCompensation | null;

  _transparencyStateWire?: TransparencyState;
  _transparencyStateParticles?: TransparencyState;
  _transparencyStateForeground?: TransparencyState;

  _transparencyPolicyWire?: MaterialTransparencyPolicy;
  _transparencyPolicyParticles?: MaterialTransparencyPolicy;
  _transparencyPolicyForeground?: MaterialTransparencyPolicy;

  _transparencyPolicyConfig?: {
    opaqueOrder: number;
    transparentOrder: number;
    depthWriteTransparent: boolean;
    depthTestTransparent: boolean;
    alphaTest: number;
    out?: MaterialTransparencyPolicy;
  };
  _foregroundOpacityBase?: number;
};

type TransparencyPolicyConfig = {
  opaqueOrder: number;
  transparentOrder: number;
  depthWriteTransparent: boolean;
  depthTestTransparent: boolean;
  alphaTest: number;
  out?: MaterialTransparencyPolicy;
};

export type ApplyMaterialsOptions = {
  wireMaterials?: MaterialLike | MaterialLike[] | null;
  particlesMaterials?: MaterialLike | MaterialLike[] | null;
  foregroundMaterials?: MaterialLike | MaterialLike[] | null;

  opaqueOrder?: number;
  transparentOrder?: number;
  depthWriteTransparent?: boolean;
  depthTestTransparent?: boolean;
  alphaTest?: number;

  alphaHash?: boolean;
  transparency?: TransparencyOptions;
};

const DEFAULT_TRANSPARENCY: TransparencyOptions = {
  minAlpha: 0,
  maxAlpha: 1,
  tauMs: 120,
  hysteresisUp: 0.01,
  hysteresisDown: 0.015,
};

const BASE_ALPHA_WIRE = 1.0;
const BASE_ALPHA_PARTICLES = 1.0;
const BASE_ALPHA_FOREGROUND = 1.0;

function computeTargetAlpha(
  baseAlpha: number,
  climateMul: number,
  influenceMul: number,
  opts: TransparencyOptions
): number {
  const minAlpha = isFiniteNumber(opts.minAlpha) ? opts.minAlpha : 0;
  const maxAlpha = isFiniteNumber(opts.maxAlpha) ? opts.maxAlpha : 1;
  const rangeMin = Math.min(minAlpha, maxAlpha);
  const rangeMax = Math.max(minAlpha, maxAlpha);
  const b = isFiniteNumber(baseAlpha) ? baseAlpha : 1;
  const c = isFiniteNumber(climateMul) ? climateMul : 1;
  const m = isFiniteNumber(influenceMul) ? influenceMul : 1;
  return clamp(b * c * m, rangeMin, rangeMax);
}

function ensureStateOnTarget(
  state: TransparencyState | undefined,
  targetAlpha: number
): TransparencyState {
  if (state) return state;
  return { stableAlpha: targetAlpha, smoothedAlpha: targetAlpha };
}

function applyPolicyToMaterial(
  material: MaterialLike,
  alpha: number,
  transparent: boolean,
  policy: MaterialTransparencyPolicy,
  alphaHashEnabled: boolean
) {
  const appliedAlpha = transparent ? alpha : 1;

  material.opacity = appliedAlpha;
  material.transparent = transparent;
  material.depthWrite = policy.depthWrite;
  material.depthTest = policy.depthTest;
  material.renderOrder = policy.renderOrder;

  if ('dithering' in material) material.dithering = policy.dithering;
  if ('alphaTest' in material) material.alphaTest = policy.alphaTest;
  if ('alphaHash' in material) material.alphaHash = alphaHashEnabled && transparent;
}

function getOpacityBase(material: MaterialLike, fallback: number): number {
  const base = material.userData?.opacityBase;
  if (isFiniteNumber(base)) return base;
  return fallback;
}

function applyToMaterialSetWithBase(
  ctx: RenderMaterialContext,
  target: MaterialLike | MaterialLike[] | null | undefined,
  alphaMul: number,
  policyConfig: TransparencyPolicyConfig,
  alphaHashEnabled: boolean,
  baseFallback: number,
  rangeMin: number,
  rangeMax: number
) {
  if (!target) return;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i += 1) {
      const mat = target[i];
      if (!mat) continue;
      const base = getOpacityBase(mat, baseFallback);
      const smokeMul = resolveSmokeAdditiveMultiplier(mat, ctx);
      const finalAlpha = clamp(alphaMul * base * smokeMul, rangeMin, rangeMax);
      const policy = computeTransparencyPolicy(finalAlpha, policyConfig);
      const transparent = finalAlpha < 0.999;
      applyPolicyToMaterial(mat, finalAlpha, transparent, policy, alphaHashEnabled);
    }
    return;
  }

  const base = getOpacityBase(target, baseFallback);
  const smokeMul = resolveSmokeAdditiveMultiplier(target, ctx);
  const finalAlpha = clamp(alphaMul * base * smokeMul, rangeMin, rangeMax);
  const policy = computeTransparencyPolicy(finalAlpha, policyConfig);
  const transparent = finalAlpha < 0.999;
  applyPolicyToMaterial(target, finalAlpha, transparent, policy, alphaHashEnabled);
}

function applyToMaterialSet(
  target: MaterialLike | MaterialLike[] | null | undefined,
  alpha: number,
  transparent: boolean,
  policy: MaterialTransparencyPolicy,
  alphaHashEnabled: boolean
) {
  if (!target) return;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i += 1) {
      const mat = target[i];
      if (mat) applyPolicyToMaterial(mat, alpha, transparent, policy, alphaHashEnabled);
    }
    return;
  }

  applyPolicyToMaterial(target, alpha, transparent, policy, alphaHashEnabled);
}

function applyToMeshList(
  meshes: MaterialHost[] | undefined,
  alpha: number,
  transparent: boolean,
  policy: MaterialTransparencyPolicy,
  alphaHashEnabled: boolean
) {
  if (!meshes) return;

  for (let i = 0; i < meshes.length; i += 1) {
    const mat = meshes[i]?.material ?? null;
    applyToMaterialSet(mat, alpha, transparent, policy, alphaHashEnabled);
  }
}

function applyToMeshListWithBase(
  ctx: RenderMaterialContext,
  meshes: MaterialHost[] | undefined,
  alphaMul: number,
  policyConfig: TransparencyPolicyConfig,
  alphaHashEnabled: boolean,
  baseFallback: number,
  rangeMin: number,
  rangeMax: number
) {
  if (!meshes) return;

  for (let i = 0; i < meshes.length; i += 1) {
    const mat = meshes[i]?.material ?? null;
    applyToMaterialSetWithBase(ctx, mat, alphaMul, policyConfig, alphaHashEnabled, baseFallback, rangeMin, rangeMax);
  }
}

function resolveSmokeAdditiveMultiplier(
  material: MaterialLike | null | undefined,
  ctx: RenderMaterialContext,
): number {
  const compensation =
    ctx.smokeCompensation ??
    computeSmokeVisualCompensation(
      ctx.smokePolicyState ?? 'premium',
      ctx.smokeAlphaLayer ?? 0,
    );

  const materialMul = isFiniteNumber(material?.userData?.additiveAlphaMultiplier)
    ? Math.max(0, material.userData.additiveAlphaMultiplier)
    : 1;

  const smokeSensitive = Boolean(material?.userData?.smokeSensitive ?? false);
  if (!smokeSensitive) return 1;

  return clamp(materialMul * compensation.additiveAlphaMultiplier, 0, 1);
}

function ensurePolicyOut(
  existing: MaterialTransparencyPolicy | undefined
): MaterialTransparencyPolicy {
  if (existing) return existing;
  return { depthWrite: true, depthTest: true, renderOrder: 0, dithering: false, alphaTest: 0 };
}

export function applyMaterials(
  ctx: RenderMaterialContext,
  renderParams: RenderParams,
  dtMs: number,
  runtimeFlags?: ApplyMaterialsOptions
) {
  const options = runtimeFlags?.transparency ?? DEFAULT_TRANSPARENCY;
  const climateMul = renderParams.optics.alpha;
  const minAlpha = isFiniteNumber(options.minAlpha) ? options.minAlpha : 0;
  const maxAlpha = isFiniteNumber(options.maxAlpha) ? options.maxAlpha : 1;
  const rangeMin = Math.min(minAlpha, maxAlpha);
  const rangeMax = Math.max(minAlpha, maxAlpha);

  const policyConfig =
    ctx._transparencyPolicyConfig ??
    (ctx._transparencyPolicyConfig = {
      opaqueOrder: 0,
      transparentOrder: 10,
      depthWriteTransparent: false,
      depthTestTransparent: true,
      alphaTest: 0,
    });

  policyConfig.opaqueOrder = isFiniteNumber(runtimeFlags?.opaqueOrder) ? runtimeFlags.opaqueOrder : 0;
  policyConfig.transparentOrder = isFiniteNumber(runtimeFlags?.transparentOrder)
    ? runtimeFlags.transparentOrder
    : 10;
  policyConfig.depthWriteTransparent =
    typeof runtimeFlags?.depthWriteTransparent === 'boolean' ? runtimeFlags.depthWriteTransparent : false;
  policyConfig.depthTestTransparent =
    typeof runtimeFlags?.depthTestTransparent === 'boolean' ? runtimeFlags.depthTestTransparent : true;
  policyConfig.alphaTest = isFiniteNumber(runtimeFlags?.alphaTest) ? runtimeFlags.alphaTest : 0;

  const alphaHashEnabled = runtimeFlags?.alphaHash === true;

  // Wire
  const wireTargetAlpha = computeTargetAlpha(BASE_ALPHA_WIRE, climateMul, renderParams.opacity.wireOpacityMul, options);
  const wireState = ensureStateOnTarget(ctx._transparencyStateWire, wireTargetAlpha);
  if (!ctx._transparencyStateWire) ctx._transparencyStateWire = wireState;

  const wireAlphaMul = computeAlphaInPlace(
    BASE_ALPHA_WIRE,
    climateMul,
    renderParams.opacity.wireOpacityMul,
    wireState,
    dtMs,
    options
  );

  ctx._transparencyPolicyWire = ensurePolicyOut(ctx._transparencyPolicyWire);
  policyConfig.out = ctx._transparencyPolicyWire;

  const wireOverride = runtimeFlags?.wireMaterials ?? null;
  if (wireOverride) {
    applyToMaterialSetWithBase(
      ctx,
      wireOverride,
      wireAlphaMul,
      policyConfig,
      alphaHashEnabled,
      BASE_ALPHA_WIRE,
      rangeMin,
      rangeMax
    );
  } else {
    applyToMeshListWithBase(
      ctx,
      ctx.wireFrames,
      wireAlphaMul,
      policyConfig,
      alphaHashEnabled,
      BASE_ALPHA_WIRE,
      rangeMin,
      rangeMax
    );
  }

  // Particles
  const particlesTargetAlpha = computeTargetAlpha(
    BASE_ALPHA_PARTICLES,
    climateMul,
    renderParams.opacity.particlesOpacityMul,
    options
  );
  const particlesState = ensureStateOnTarget(ctx._transparencyStateParticles, particlesTargetAlpha);
  if (!ctx._transparencyStateParticles) ctx._transparencyStateParticles = particlesState;

  const particlesAlphaMul = computeAlphaInPlace(
    BASE_ALPHA_PARTICLES,
    climateMul,
    renderParams.opacity.particlesOpacityMul,
    particlesState,
    dtMs,
    options
  );

  ctx._transparencyPolicyParticles = ensurePolicyOut(ctx._transparencyPolicyParticles);
  policyConfig.out = ctx._transparencyPolicyParticles;

  const particlesOverride = runtimeFlags?.particlesMaterials ?? null;
  const particlesBaseFallback = isFiniteNumber(ctx.particlesConfig?.opacity)
    ? clamp(ctx.particlesConfig.opacity, rangeMin, rangeMax)
    : BASE_ALPHA_PARTICLES;
  if (particlesOverride) {
    applyToMaterialSetWithBase(
      ctx,
      particlesOverride,
      particlesAlphaMul,
      policyConfig,
      alphaHashEnabled,
      particlesBaseFallback,
      rangeMin,
      rangeMax
    );
  } else {
    applyToMaterialSetWithBase(
      ctx,
      ctx.particlesPoints?.material ?? null,
      particlesAlphaMul,
      policyConfig,
      alphaHashEnabled,
      particlesBaseFallback,
      rangeMin,
      rangeMax
    );
    applyToMaterialSetWithBase(
      ctx,
      ctx.particlesTrails?.material ?? null,
      particlesAlphaMul,
      policyConfig,
      alphaHashEnabled,
      particlesBaseFallback,
      rangeMin,
      rangeMax
    );
    applyToMaterialSetWithBase(
      ctx,
      ctx.particlesLinks?.material ?? null,
      particlesAlphaMul,
      policyConfig,
      alphaHashEnabled,
      particlesBaseFallback,
      rangeMin,
      rangeMax
    );
  }

  // Foreground
  const fgBase = isFiniteNumber(ctx._foregroundOpacityBase) ? ctx._foregroundOpacityBase : BASE_ALPHA_FOREGROUND;
  const fgTargetAlpha = computeTargetAlpha(
    fgBase,
    climateMul,
    renderParams.opacity.foregroundOpacity,
    options
  );
  const fgState = ensureStateOnTarget(ctx._transparencyStateForeground, fgTargetAlpha);
  if (!ctx._transparencyStateForeground) ctx._transparencyStateForeground = fgState;

  const fgAlpha = computeAlphaInPlace(
    fgBase,
    climateMul,
    renderParams.opacity.foregroundOpacity,
    fgState,
    dtMs,
    options
  );

  ctx._transparencyPolicyForeground = ensurePolicyOut(ctx._transparencyPolicyForeground);
  policyConfig.out = ctx._transparencyPolicyForeground;

  const fgPolicy = computeTransparencyPolicy(fgAlpha, policyConfig);
  const fgTransparent = fgAlpha < 0.999;

  const fgOverride = runtimeFlags?.foregroundMaterials ?? null;
  if (fgOverride) {
    applyToMaterialSet(fgOverride, fgAlpha, fgTransparent, fgPolicy, alphaHashEnabled);
  } else {
    applyToMaterialSet(ctx.foregroundMesh?.material ?? null, fgAlpha, fgTransparent, fgPolicy, alphaHashEnabled);
  }
}
