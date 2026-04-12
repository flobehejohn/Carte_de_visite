import type { RenderParams } from '../materials/materialParams';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function ema(prev: number, next: number, alpha: number): number {
  if (!Number.isFinite(prev)) return next;
  if (!Number.isFinite(next)) return prev;
  const a = Number.isFinite(alpha) ? alpha : 1;
  return prev + (next - prev) * a;
}

export function alphaFromTau(dtMs: number, tauMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  if (!Number.isFinite(tauMs) || tauMs <= 0) return 1;
  const alpha = 1 - Math.exp(-dtMs / tauMs);
  return clamp01(alpha);
}

export function applyEmaToRenderParams(
  prev: RenderParams,
  next: RenderParams,
  dtMs: number,
  tauMs: number
): RenderParams {
  const alpha = alphaFromTau(dtMs, tauMs);
  const smooth = (a: number, b: number) => ema(a, b, alpha);

  const prevBg = typeof prev.volume.bgColor === 'number' ? prev.volume.bgColor : next.volume.bgColor ?? 0;
  const nextBg = typeof next.volume.bgColor === 'number' ? next.volume.bgColor : prevBg;
  const prevGlow = typeof prev.volume.glowColor === 'number' ? prev.volume.glowColor : next.volume.glowColor ?? 0;
  const nextGlow = typeof next.volume.glowColor === 'number' ? next.volume.glowColor : prevGlow;

  return {
    presetName: next.presetName,
    fog: {
      enabled: next.fog.enabled,
      density: smooth(prev.fog.density, next.fog.density),
      color: smooth(prev.fog.color, next.fog.color),
    },
    bloom: {
      strength: smooth(prev.bloom.strength, next.bloom.strength),
      radius: smooth(prev.bloom.radius, next.bloom.radius),
      threshold: smooth(prev.bloom.threshold, next.bloom.threshold),
    },
    volume: {
      glowIntensity: smooth(prev.volume.glowIntensity, next.volume.glowIntensity),
      backgroundStrength: smooth(prev.volume.backgroundStrength, next.volume.backgroundStrength),
      softness: smooth(prev.volume.softness, next.volume.softness),
      vignette: smooth(prev.volume.vignette, next.volume.vignette),
      bgColor: smooth(prevBg, nextBg),
      glowColor: smooth(prevGlow, nextGlow),
    },
    opacity: {
      wireOpacityMul: smooth(prev.opacity.wireOpacityMul, next.opacity.wireOpacityMul),
      particlesOpacityMul: smooth(prev.opacity.particlesOpacityMul, next.opacity.particlesOpacityMul),
      foregroundOpacity: smooth(prev.opacity.foregroundOpacity, next.opacity.foregroundOpacity),
    },
    optics: {
      alpha: smooth(prev.optics.alpha, next.optics.alpha),
      transmission: smooth(prev.optics.transmission, next.optics.transmission),
      thickness: smooth(prev.optics.thickness, next.optics.thickness),
      ior: smooth(prev.optics.ior, next.optics.ior),
      roughness: smooth(prev.optics.roughness, next.optics.roughness),
      clearcoat: smooth(prev.optics.clearcoat, next.optics.clearcoat),
      scattering: smooth(prev.optics.scattering, next.optics.scattering),
      absorption: smooth(prev.optics.absorption, next.optics.absorption),
    },
  };
}
