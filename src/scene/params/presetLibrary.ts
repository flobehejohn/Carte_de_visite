// src/scene/params/presetLibrary.ts
// Fix: Suppression import circulaire + Diversité garantie

// Définition locale minimaliste pour éviter le cycle avec ClimateController
export type ClimatePresetDef = {
  fog?: { density: number; color: string };
  bloom?: { strength: number; radius: number; threshold: number };
  volume?: { glowIntensity: number; backgroundStrength: number; softness: number; color: string };
  opacity?: { wireOpacityMul?: number; particlesOpacityMul?: number; foregroundOpacity?: number };
  name?: string;
  // allow other props
  [key: string]: any;
};

export const SAFE_RANGES = {
  fogDensity: { min: 0.0, max: 0.15 },
  bloomStrength: { min: 0.0, max: 2.0 },
  bloomRadius: { min: 0.0, max: 1.5 },
  bloomThreshold: { min: 0.0, max: 1.0 },
  glowIntensity: { min: 0.0, max: 2.0 },
  backgroundStrength: { min: 0.0, max: 2.0 },
  softness: { min: 0.0, max: 2.0 },
  opacityMul: { min: 0.0, max: 1.5 },
  foregroundOpacityMul: { min: 0.0, max: 1.25 },
};

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function jitter(val: number, range: number, rng: () => number, limits?: { min: number; max: number }) {
  if (val === undefined || val === null) return val; // Protection NaN
  const delta = (rng() - 0.5) * 2 * range;
  let res = val + delta;
  if (limits) res = clamp(res, limits.min, limits.max);
  return res;
}

export function buildPresetVariants(
  basePresets: Record<string, ClimatePresetDef>,
  opts: { perBase: number; seed: number | string }
): Record<string, ClimatePresetDef> {
  const variants: Record<string, ClimatePresetDef> = {};
  
  const seedStr = String(opts.seed);
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) seedNum += seedStr.charCodeAt(i);
  const rng = mulberry32(seedNum);

  Object.entries(basePresets).forEach(([baseName, def]) => {
    for (let i = 0; i < opts.perBase; i++) {
      const name = `${baseName}__V${i.toString().padStart(2, '0')}`;
      const v = JSON.parse(JSON.stringify(def)) as ClimatePresetDef;

      if (v.fog) v.fog.density = jitter(v.fog.density, 0.015, rng, SAFE_RANGES.fogDensity);

      if (v.bloom) {
        v.bloom.strength = jitter(v.bloom.strength, 0.3, rng, SAFE_RANGES.bloomStrength);
        v.bloom.radius = jitter(v.bloom.radius, 0.2, rng, SAFE_RANGES.bloomRadius);
        v.bloom.threshold = jitter(v.bloom.threshold, 0.1, rng, SAFE_RANGES.bloomThreshold);
      }

      if (v.volume) {
        v.volume.glowIntensity = jitter(v.volume.glowIntensity, 0.3, rng, SAFE_RANGES.glowIntensity);
        v.volume.backgroundStrength = jitter(v.volume.backgroundStrength, 0.2, rng, SAFE_RANGES.backgroundStrength);
      }

      if (v.opacity) {
        const fgRange = baseName.includes('Cendre') ? 0.2 : 0.05; 
        if (v.opacity.foregroundOpacity !== undefined) {
             v.opacity.foregroundOpacity = jitter(v.opacity.foregroundOpacity, fgRange, rng, SAFE_RANGES.foregroundOpacityMul);
        }
      }
      variants[name] = v;
    }
  });
  return variants;
}
