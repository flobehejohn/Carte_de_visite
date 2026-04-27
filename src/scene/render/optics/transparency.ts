import {
  clamp01 as clamp01Base,
  clamp as clampBase,
  isFiniteNumber as isFiniteNumberBase,
} from '../materials/materialParams';
import { alphaFromTau } from '../utils/smoothing';

export type TransparencyState = { stableAlpha: number; smoothedAlpha: number };

export type TransparencyOptions = {
  minAlpha: number;
  maxAlpha: number;
  tauMs: number;
  hysteresisUp: number;
  hysteresisDown: number;
};

export type MaterialTransparencyPolicy = {
  depthWrite: boolean;
  depthTest: boolean;
  renderOrder: number;
  dithering: boolean;
  alphaTest: number;
};

export const clamp = clampBase;
export const clamp01 = clamp01Base;
export const isFiniteNumber = isFiniteNumberBase;
export { alphaFromTau };

function safeMul(value: number, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function computeTargetAlpha(
  baseAlpha: number,
  climateMul: number,
  influenceMul: number,
  opts: TransparencyOptions,
): number {
  const minAlpha = isFiniteNumber(opts.minAlpha) ? opts.minAlpha : 0;
  const maxAlpha = isFiniteNumber(opts.maxAlpha) ? opts.maxAlpha : 1;
  const rangeMin = Math.min(minAlpha, maxAlpha);
  const rangeMax = Math.max(minAlpha, maxAlpha);
  const base = safeMul(baseAlpha, 1);
  const climate = safeMul(climateMul, 1);
  const influence = safeMul(influenceMul, 1);
  return clamp(base * climate * influence, rangeMin, rangeMax);
}

export function applyHysteresis(
  prevStable: number,
  nextCandidate: number,
  upEps: number,
  downEps: number,
): number {
  const up = isFiniteNumber(upEps) ? Math.max(0, upEps) : 0;
  const down = isFiniteNumber(downEps) ? Math.max(0, downEps) : 0;

  if (nextCandidate > prevStable + up) return nextCandidate;
  if (nextCandidate < prevStable - down) return nextCandidate;
  return prevStable;
}

export function computeAlphaInPlace(
  baseAlpha: number,
  climateMul: number,
  influenceMul: number,
  state: TransparencyState,
  dtMs: number,
  opts: TransparencyOptions,
): number {
  const minAlpha = isFiniteNumber(opts.minAlpha) ? opts.minAlpha : 0;
  const maxAlpha = isFiniteNumber(opts.maxAlpha) ? opts.maxAlpha : 1;
  const rangeMin = Math.min(minAlpha, maxAlpha);
  const rangeMax = Math.max(minAlpha, maxAlpha);
  const target = computeTargetAlpha(baseAlpha, climateMul, influenceMul, opts);

  const dt = isFiniteNumber(dtMs) ? Math.max(0, dtMs) : 0;
  const smoothingAlpha = alphaFromTau(dt, opts.tauMs);

  const prevSmooth = isFiniteNumber(state.smoothedAlpha)
    ? state.smoothedAlpha
    : target;
  const smoothed = clamp(
    prevSmooth + (target - prevSmooth) * smoothingAlpha,
    rangeMin,
    rangeMax,
  );

  const prevStable = isFiniteNumber(state.stableAlpha)
    ? state.stableAlpha
    : smoothed;
  const stable = applyHysteresis(
    prevStable,
    smoothed,
    opts.hysteresisUp,
    opts.hysteresisDown,
  );

  const finalAlpha = clamp(stable, rangeMin, rangeMax);

  state.smoothedAlpha = smoothed;
  state.stableAlpha = finalAlpha;

  return finalAlpha;
}

export function computeAlpha(
  baseAlpha: number,
  climateMul: number,
  influenceMul: number,
  prevState: TransparencyState | null | undefined,
  dtMs: number,
  opts: TransparencyOptions,
): { alpha: number; nextState: TransparencyState } {
  const target = computeTargetAlpha(baseAlpha, climateMul, influenceMul, opts);

  const nextState = prevState ?? {
    stableAlpha: target,
    smoothedAlpha: target,
  };

  if (!prevState) {
    nextState.stableAlpha = target;
    nextState.smoothedAlpha = target;
  }

  const alpha = computeAlphaInPlace(
    baseAlpha,
    climateMul,
    influenceMul,
    nextState,
    dtMs,
    opts,
  );

  return { alpha, nextState };
}


export type SmokePolicyState = 'premium' | 'simplified' | 'off';
export type SmokePolicySource = 'forced' | 'quality-profile' | 'runtime-budget';

export type SmokeVisualCompensation = {
  fogDensityMultiplier: number;
  glowIntensityMultiplier: number;
  volumetricBackgroundMultiplier: number;
  additiveAlphaMultiplier: number;
};

export function resolveSmokePolicyStateFromProfile(
  profileName: string | null | undefined,
): SmokePolicyState {
  const profile = String(profileName || '').toLowerCase();

  if (profile === 'safe') return 'off';
  if (profile === 'low' || profile === 'medium') return 'simplified';
  return 'premium';
}

export function resolveSmokePolicySource(
  forcedState: SmokePolicyState | null | undefined,
  runtimeBudgetDowngrade: boolean | null | undefined,
): SmokePolicySource {
  if (forcedState) return 'forced';
  if (runtimeBudgetDowngrade) return 'runtime-budget';
  return 'quality-profile';
}

function clampMul(value: number, fallback = 1): number {
  return isFiniteNumber(value) ? Math.max(0, value) : fallback;
}

export function computeSmokeVisualCompensation(
  state: SmokePolicyState,
  smokeAlphaLayer: number | null | undefined,
): SmokeVisualCompensation {
  const alpha = isFiniteNumber(smokeAlphaLayer) ? Math.max(0, smokeAlphaLayer) : 0;

  if (state === 'off') {
    return {
      fogDensityMultiplier: clampMul(1.12 - alpha * 0.15, 1.06),
      glowIntensityMultiplier: clampMul(0.84 - alpha * 0.10, 0.82),
      volumetricBackgroundMultiplier: 0.12,
      additiveAlphaMultiplier: 0.62,
    };
  }

  if (state === 'simplified') {
    return {
      fogDensityMultiplier: clampMul(1.06 - alpha * 0.08, 1.02),
      glowIntensityMultiplier: clampMul(0.92 - alpha * 0.05, 0.90),
      volumetricBackgroundMultiplier: 0.55,
      additiveAlphaMultiplier: 0.82,
    };
  }

  return {
    fogDensityMultiplier: 1,
    glowIntensityMultiplier: 1,
    volumetricBackgroundMultiplier: 1,
    additiveAlphaMultiplier: 1,
  };
}

type TransparencyPolicyConfig = {
  opaqueOrder: number;
  transparentOrder: number;
  depthWriteTransparent: boolean;
  depthTestTransparent: boolean;
  alphaTest: number;
  out?: MaterialTransparencyPolicy;
};

export function computeTransparencyPolicy(
  alpha: number,
  policyConfig: TransparencyPolicyConfig,
): MaterialTransparencyPolicy {
  const safeAlpha = isFiniteNumber(alpha) ? alpha : 1;
  const isOpaque = safeAlpha >= 0.999;

  const out =
    policyConfig.out ?? {
      depthWrite: true,
      depthTest: true,
      renderOrder: 0,
      dithering: false,
      alphaTest: 0,
    };

  out.depthWrite = isOpaque ? true : policyConfig.depthWriteTransparent;
  out.depthTest = isOpaque ? true : policyConfig.depthTestTransparent;
  out.renderOrder = isOpaque
    ? policyConfig.opaqueOrder
    : policyConfig.transparentOrder;

  out.dithering = !isOpaque && safeAlpha < 1;
  out.alphaTest = isFiniteNumber(policyConfig.alphaTest)
    ? Math.max(0, policyConfig.alphaTest)
    : 0;

  return out;
}
