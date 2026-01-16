export const SAFE_RANGES = {
  fogDensity: { min: 0.005, max: 0.06 },
  bloomStrength: { min: 0.0, max: 1.35 },
  bloomRadius: { min: 0.0, max: 0.55 },
  bloomThreshold: { min: 0.65, max: 0.95 },
  glowIntensity: { min: 0.1, max: 0.9 },
  backgroundStrength: { min: 0.1, max: 1.1 },
  softness: { min: 0.1, max: 1.25 },
  opacityMul: { min: 0.4, max: 1.25 },
  foregroundOpacityMul: { min: 0.0, max: 1.25 },
};

type Curve4 = { low: number; mid: number; peak: number; end: number };
type PresetDef = {
  name: string;
  colors: { fog: number; glow: number; bg: number };
  fog: Curve4;
  bloomStrength: Curve4;
  bloomRadius: Curve4;
  bloomThreshold: Curve4;
  glowIntensity: Curve4;
  backgroundStrength: Curve4;
  softness: Curve4;
  wireOpacityMul: Curve4;
  particlesOpacityMul: Curve4;
  foregroundOpacityMul: Curve4;
  vignette: number;
};

type VariantOptions = { perBase: number; seed: number | string; tagPrefix?: string };

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(v) || 0));
}

function clamp01(v: number) {
  return clamp(v, 0, 1);
}

function hashSeed(input: number | string) {
  const str = String(input);
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
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

function jitter(v: number, amp: number, rand: () => number) {
  return v * (1 + (rand() * 2 - 1) * amp);
}

function jitterCurve(range: Curve4, amp: number, min: number, max: number, rand: () => number): Curve4 {
  return {
    low: clamp(jitter(range.low, amp, rand), min, max),
    mid: clamp(jitter(range.mid, amp, rand), min, max),
    peak: clamp(jitter(range.peak, amp, rand), min, max),
    end: clamp(jitter(range.end, amp, rand), min, max),
  };
}

function toRgb(color: number) {
  return {
    r: ((color >> 16) & 0xff) / 255,
    g: ((color >> 8) & 0xff) / 255,
    b: (color & 0xff) / 255,
  };
}

function fromRgb(rgb: { r: number; g: number; b: number }) {
  const r = Math.round(clamp01(rgb.r) * 255);
  const g = Math.round(clamp01(rgb.g) * 255);
  const b = Math.round(clamp01(rgb.b) * 255);
  return (r << 16) | (g << 8) | b;
}

function jitterColor(color: number, amp: number, rand: () => number) {
  const { r, g, b } = toRgb(color);
  return fromRgb({
    r: clamp01(r + (rand() * 2 - 1) * amp),
    g: clamp01(g + (rand() * 2 - 1) * amp),
    b: clamp01(b + (rand() * 2 - 1) * amp),
  });
}

export function buildPresetVariants<T extends Record<string, any>>(
  basePresets: T,
  opts: VariantOptions
): Record<string, any> {
  const variants: Record<string, PresetDef> = {};
  const perBase = Math.max(0, Math.floor(opts.perBase));
  const baseSeed = String(opts.seed ?? 'preset-v1');
  const prefix = opts.tagPrefix ?? '';

  const entries = Object.entries(basePresets) as Array<[string, PresetDef]>;
  for (const [baseName, preset] of entries) {
    for (let i = 0; i < perBase; i += 1) {
      const variantTag = `${baseName}|${i}|${baseSeed}`;
      const rand = mulberry32(hashSeed(variantTag));
      const variantName = `${prefix}${baseName}__V${String(i).padStart(2, '0')}`;

      variants[variantName] = {
        name: variantName,
        colors: {
          fog: jitterColor(preset.colors.fog, 0.06, rand),
          glow: jitterColor(preset.colors.glow, 0.06, rand),
          bg: jitterColor(preset.colors.bg, 0.06, rand),
        },
        fog: jitterCurve(preset.fog, 0.08, SAFE_RANGES.fogDensity.min, SAFE_RANGES.fogDensity.max, rand),
        bloomStrength: jitterCurve(
          preset.bloomStrength,
          0.1,
          SAFE_RANGES.bloomStrength.min,
          SAFE_RANGES.bloomStrength.max,
          rand
        ),
        bloomRadius: jitterCurve(
          preset.bloomRadius,
          0.1,
          SAFE_RANGES.bloomRadius.min,
          SAFE_RANGES.bloomRadius.max,
          rand
        ),
        bloomThreshold: jitterCurve(
          preset.bloomThreshold,
          0.05,
          SAFE_RANGES.bloomThreshold.min,
          SAFE_RANGES.bloomThreshold.max,
          rand
        ),
        glowIntensity: jitterCurve(
          preset.glowIntensity,
          0.1,
          SAFE_RANGES.glowIntensity.min,
          SAFE_RANGES.glowIntensity.max,
          rand
        ),
        backgroundStrength: jitterCurve(
          preset.backgroundStrength,
          0.08,
          SAFE_RANGES.backgroundStrength.min,
          SAFE_RANGES.backgroundStrength.max,
          rand
        ),
        softness: jitterCurve(preset.softness, 0.08, SAFE_RANGES.softness.min, SAFE_RANGES.softness.max, rand),
        wireOpacityMul: jitterCurve(
          preset.wireOpacityMul,
          0.08,
          SAFE_RANGES.opacityMul.min,
          SAFE_RANGES.opacityMul.max,
          rand
        ),
        particlesOpacityMul: jitterCurve(
          preset.particlesOpacityMul,
          0.08,
          SAFE_RANGES.opacityMul.min,
          SAFE_RANGES.opacityMul.max,
          rand
        ),
        foregroundOpacityMul: jitterCurve(
          preset.foregroundOpacityMul,
          0.1,
          SAFE_RANGES.foregroundOpacityMul.min,
          SAFE_RANGES.foregroundOpacityMul.max,
          rand
        ),
        vignette: preset.vignette,
      };
    }
  }

  return variants;
}
