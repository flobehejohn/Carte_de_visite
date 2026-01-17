import type { ClimateTargets } from '../../params/ClimateController';
import { applyEmaToRenderParams } from '../utils/smoothing';
import {
  defaultOptics,
  ensureRenderParamsInvariant,
  normalizeColorToNumber,
  type RenderParams,
} from './materialParams';

type SmoothingOptions = { enabled: boolean; tauMs: number };
type MapOptions = { dt?: number; smoothing?: SmoothingOptions };

export function mapClimateToRenderParams(
  targets: ClimateTargets,
  opts?: MapOptions,
  prev?: RenderParams | null
): RenderParams {
  const presetName = typeof targets.presetName === 'string' && targets.presetName ? targets.presetName : 'Unknown';
  const fogColor = normalizeColorToNumber(targets.fog?.color, 0x000000);
  const bgColor = normalizeColorToNumber(targets.volume?.bgColor ?? fogColor, fogColor);
  const glowColor = normalizeColorToNumber(targets.volume?.glowColor ?? fogColor, fogColor);

  const next: RenderParams = {
    presetName,
    fog: {
      enabled: Boolean(targets.fog?.enabled),
      density: targets.fog?.density ?? 0,
      color: fogColor,
    },
    bloom: {
      strength: targets.bloom?.strength ?? 0,
      radius: targets.bloom?.radius ?? 0,
      threshold: targets.bloom?.threshold ?? 0,
    },
    volume: {
      glowIntensity: targets.volume?.glowIntensity ?? 0,
      backgroundStrength: targets.volume?.backgroundStrength ?? 0,
      softness: targets.volume?.softness ?? 0,
      vignette: targets.volume?.vignette ?? 1,
      bgColor,
      glowColor,
    },
    opacity: {
      wireOpacityMul: targets.opacity?.wireOpacityMul ?? 1,
      particlesOpacityMul: targets.opacity?.particlesOpacityMul ?? 1,
      foregroundOpacity: targets.opacity?.foregroundOpacity ?? 1,
    },
    optics: defaultOptics(),
  };

  const ensuredNext = ensureRenderParamsInvariant(next);
  const smoothing = opts?.smoothing;
  const dtMs = typeof opts?.dt === 'number' && Number.isFinite(opts.dt) ? opts.dt : null;
  const tauMs = typeof smoothing?.tauMs === 'number' && Number.isFinite(smoothing.tauMs) ? smoothing.tauMs : null;

  if (smoothing?.enabled && prev && dtMs != null && tauMs != null) {
    const safePrev = ensureRenderParamsInvariant(prev);
    const smoothed = applyEmaToRenderParams(safePrev, ensuredNext, dtMs, tauMs);
    return ensureRenderParamsInvariant(smoothed);
  }

  return ensuredNext;
}
