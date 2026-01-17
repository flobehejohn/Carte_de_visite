export type MaterialOptics = {
  alpha: number;
  transmission: number;
  thickness: number;
  ior: number;
  roughness: number;
  clearcoat: number;
  scattering: number;
  absorption: number;
};

export type RenderFog = {
  enabled: boolean;
  density: number;
  color: number;
};

export type RenderBloom = {
  strength: number;
  radius: number;
  threshold: number;
};

export type RenderVolume = {
  glowIntensity: number;
  backgroundStrength: number;
  softness: number;
  vignette: number;
  bgColor?: number;
  glowColor?: number;
};

export type RenderOpacity = {
  wireOpacityMul: number;
  particlesOpacityMul: number;
  foregroundOpacity: number;
};

export type RenderParams = {
  presetName: string;
  fog: RenderFog;
  bloom: RenderBloom;
  volume: RenderVolume;
  opacity: RenderOpacity;
  optics: MaterialOptics;
};

type Range = { min: number; max: number };

export const RenderSafeRanges = {
  fogDensity: { min: 0.0, max: 0.25 },
  bloomStrength: { min: 0.0, max: 3.0 },
  bloomRadius: { min: 0.0, max: 2.0 },
  bloomThreshold: { min: 0.0, max: 1.0 },
  glowIntensity: { min: 0.0, max: 2.0 },
  backgroundStrength: { min: 0.0, max: 2.0 },
  softness: { min: 0.0, max: 2.0 },
  vignette: { min: 0.0, max: 2.0 },
  wireOpacityMul: { min: 0.0, max: 2.0 },
  particlesOpacityMul: { min: 0.0, max: 2.0 },
  foregroundOpacity: { min: 0.0, max: 1.25 },
  optics: {
    alpha: { min: 0.0, max: 1.0 },
    transmission: { min: 0.0, max: 1.0 },
    thickness: { min: 0.0, max: 1.0 },
    ior: { min: 1.0, max: 2.5 },
    roughness: { min: 0.0, max: 1.0 },
    clearcoat: { min: 0.0, max: 1.0 },
    scattering: { min: 0.0, max: 1.0 },
    absorption: { min: 0.0, max: 1.0 },
  },
} as const;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampColor(value: number, fallback: number): number {
  const base = isFiniteNumber(value) ? value : fallback;
  return Math.round(clamp(base, 0, 0xffffff));
}

export function normalizeColorToNumber(input: string | number | unknown, fallback: number): number {
  const safeFallback = isFiniteNumber(fallback) ? fallback : 0;
  if (isFiniteNumber(input)) return clampColor(input, safeFallback);
  if (typeof input !== 'string') return clampColor(safeFallback, safeFallback);
  const raw = input.trim();
  if (!raw) return clampColor(safeFallback, safeFallback);
  let hex = raw;
  if (raw.startsWith('#')) hex = raw.slice(1);
  else if (raw.startsWith('0x') || raw.startsWith('0X')) hex = raw.slice(2);
  const parsed = Number.parseInt(hex, 16);
  if (!Number.isFinite(parsed)) return clampColor(safeFallback, safeFallback);
  return clampColor(parsed, safeFallback);
}

export function defaultOptics(): MaterialOptics {
  return {
    alpha: 1.0,
    transmission: 0.0,
    thickness: 0.1,
    ior: 1.35,
    roughness: 0.4,
    clearcoat: 0.0,
    scattering: 0.0,
    absorption: 0.0,
  };
}

function safeNumber(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function clampRange(value: number, range: Range): number {
  return clamp(value, range.min, range.max);
}

export function ensureRenderParamsInvariant(rp: RenderParams): RenderParams {
  const fogColor = normalizeColorToNumber(rp.fog?.color, 0x000000);
  const bgColor = normalizeColorToNumber(rp.volume?.bgColor ?? fogColor, fogColor);
  const glowColor = normalizeColorToNumber(rp.volume?.glowColor ?? fogColor, fogColor);
  const optics = rp.optics ?? defaultOptics();

  return {
    presetName: typeof rp.presetName === 'string' && rp.presetName ? rp.presetName : 'Unknown',
    fog: {
      enabled: Boolean(rp.fog?.enabled),
      density: clampRange(safeNumber(rp.fog?.density, 0), RenderSafeRanges.fogDensity),
      color: fogColor,
    },
    bloom: {
      strength: clampRange(safeNumber(rp.bloom?.strength, 0), RenderSafeRanges.bloomStrength),
      radius: clampRange(safeNumber(rp.bloom?.radius, 0), RenderSafeRanges.bloomRadius),
      threshold: clampRange(safeNumber(rp.bloom?.threshold, 0), RenderSafeRanges.bloomThreshold),
    },
    volume: {
      glowIntensity: clampRange(safeNumber(rp.volume?.glowIntensity, 0), RenderSafeRanges.glowIntensity),
      backgroundStrength: clampRange(
        safeNumber(rp.volume?.backgroundStrength, 0),
        RenderSafeRanges.backgroundStrength
      ),
      softness: clampRange(safeNumber(rp.volume?.softness, 0), RenderSafeRanges.softness),
      vignette: clampRange(safeNumber(rp.volume?.vignette, 0), RenderSafeRanges.vignette),
      bgColor,
      glowColor,
    },
    opacity: {
      wireOpacityMul: clampRange(
        safeNumber(rp.opacity?.wireOpacityMul, 1),
        RenderSafeRanges.wireOpacityMul
      ),
      particlesOpacityMul: clampRange(
        safeNumber(rp.opacity?.particlesOpacityMul, 1),
        RenderSafeRanges.particlesOpacityMul
      ),
      foregroundOpacity: clampRange(
        safeNumber(rp.opacity?.foregroundOpacity, 1),
        RenderSafeRanges.foregroundOpacity
      ),
    },
    optics: {
      alpha: clampRange(safeNumber(optics.alpha, 1), RenderSafeRanges.optics.alpha),
      transmission: clampRange(safeNumber(optics.transmission, 0), RenderSafeRanges.optics.transmission),
      thickness: clampRange(safeNumber(optics.thickness, 0), RenderSafeRanges.optics.thickness),
      ior: clampRange(safeNumber(optics.ior, 1.35), RenderSafeRanges.optics.ior),
      roughness: clampRange(safeNumber(optics.roughness, 0.4), RenderSafeRanges.optics.roughness),
      clearcoat: clampRange(safeNumber(optics.clearcoat, 0), RenderSafeRanges.optics.clearcoat),
      scattering: clampRange(safeNumber(optics.scattering, 0), RenderSafeRanges.optics.scattering),
      absorption: clampRange(safeNumber(optics.absorption, 0), RenderSafeRanges.optics.absorption),
    },
  };
}
