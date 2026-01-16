// src/scene/params/presetLibrary.ts
// Bibliothèque de variantes climatiques (Support Nombres, Courbes, Couleurs)

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
} as const;

type Range = { min: number; max: number };
export type PresetDefAny = { name?: string; [key: string]: unknown };
type Curve4 = { low: number; mid: number; peak: number; end: number };

// --- UTILS ---

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

function clamp01(val: number) { return clamp(val, 0, 1); }

function deepClone<T>(obj: T): T { return structuredClone(obj); }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

// --- JITTERS ---

function jitterNumber(val: number, amp: number, rng: () => number, limits: Range) {
  const delta = (rng() * 2 - 1) * amp;
  const res = val * (1 + delta);
  return clamp(res, limits.min, limits.max);
}

function isCurve4(value: unknown): value is Curve4 {
  if (!isRecord(value)) return false;
  return isNumber(value.low) && isNumber(value.mid) && isNumber(value.peak) && isNumber(value.end);
}

function jitterCurve4(curve: Curve4, amp: number, rng: () => number, limits: Range): Curve4 {
  return {
    low: jitterNumber(curve.low, amp, rng, limits),
    mid: jitterNumber(curve.mid, amp, rng, limits),
    peak: jitterNumber(curve.peak, amp, rng, limits),
    end: jitterNumber(curve.end, amp, rng, limits),
  };
}

// --- COLORS ---

function parseHexColor(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('#')) return parseInt(raw.slice(1), 16);
  if (raw.startsWith('0x') || raw.startsWith('0X')) return parseInt(raw.slice(2), 16);
  return null;
}

function formatHexColor(value: number, prefix: string) {
  const hex = value.toString(16).padStart(6, '0');
  return prefix.startsWith('#') ? `#${hex}` : `0x${hex}`;
}

function jitterColorNumber(color: number, amp: number, rng: () => number) {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const rn = clamp01(r + (rng() * 2 - 1) * amp);
  const gn = clamp01(g + (rng() * 2 - 1) * amp);
  const bn = clamp01(b + (rng() * 2 - 1) * amp);
  return (Math.round(rn * 255) << 16) | (Math.round(gn * 255) << 8) | Math.round(bn * 255);
}

function jitterColorValue(value: unknown, amp: number, rng: () => number): unknown {
  if (isNumber(value)) return jitterColorNumber(value, amp, rng);
  if (typeof value === 'string') {
    const parsed = parseHexColor(value);
    if (parsed == null || !Number.isFinite(parsed)) return value;
    const jittered = jitterColorNumber(parsed, amp, rng);
    const prefix = value.startsWith('#') ? '#' : '0x';
    return formatHexColor(jittered, prefix);
  }
  return value;
}

function canonicalBaseName(raw: string) {
  const s = String(raw ?? '').trim();
  const lower = s.toLowerCase();
  if (lower === 'cendres' || lower === 'cinder' || lower === 'ash') return 'Cendre';
  if (lower === 'aurora') return 'Aurore';
  return s;
}

// --- BUILDER ---

export function buildPresetVariants<T extends PresetDefAny>(
  basePresets: Record<string, T>,
  opts: { perBase: number; seed: number | string; tagPrefix?: string }
): Record<string, T> {
  const variants: Record<string, T> = {};
  const seedStr = String(opts.seed);
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) seedNum += seedStr.charCodeAt(i);
  const rng = mulberry32(seedNum);
  const prefix = opts.tagPrefix ?? '';

  for (const rawBaseName of Object.keys(basePresets)) {
    const def = basePresets[rawBaseName];
    const baseName = canonicalBaseName(def.name ?? rawBaseName);

    for (let i = 0; i < opts.perBase; i++) {
      const name = `${prefix}${baseName}__V${i.toString().padStart(2, '0')}`;
      const v = deepClone(def);
      const mut: PresetDefAny = v;
      mut.name = name;

      const ampSoft = 0.08;
      const ampMid = 0.1;
      const ampStrong = 0.12;
      const colorAmp = 0.06;

      const jitterField = (key: string, range: Range, ampSimple: number, ampCurve: number) => {
        const val = mut[key];
        if (isNumber(val)) {
          mut[key] = jitterNumber(val, ampSimple, rng, range);
        } else if (isCurve4(val)) {
          mut[key] = jitterCurve4(val, ampCurve, rng, range);
        }
      };

      const jitterRecordField = (
        record: Record<string, unknown>,
        key: string,
        range: Range,
        amp: number
      ) => {
        const val = record[key];
        if (isNumber(val)) {
          record[key] = jitterNumber(val, amp, rng, range);
        } else if (isCurve4(val)) {
          record[key] = jitterCurve4(val, amp, rng, range);
        }
      };

      const fogVal = mut['fog'];
      if (isCurve4(fogVal)) {
        mut['fog'] = jitterCurve4(fogVal, ampMid, rng, SAFE_RANGES.fogDensity);
      } else {
        const fog = getRecord(fogVal);
        if (fog) {
          jitterRecordField(fog, 'density', SAFE_RANGES.fogDensity, ampMid);
          if ('color' in fog) fog['color'] = jitterColorValue(fog['color'], colorAmp, rng);
        }
      }

      const bloom = getRecord(mut['bloom']);
      if (bloom) {
        jitterRecordField(bloom, 'strength', SAFE_RANGES.bloomStrength, ampMid);
        jitterRecordField(bloom, 'radius', SAFE_RANGES.bloomRadius, ampSoft);
        jitterRecordField(bloom, 'threshold', SAFE_RANGES.bloomThreshold, ampMid);
      }
      jitterField('bloomStrength', SAFE_RANGES.bloomStrength, ampMid, ampMid);
      jitterField('bloomRadius', SAFE_RANGES.bloomRadius, ampSoft, ampSoft);
      jitterField('bloomThreshold', SAFE_RANGES.bloomThreshold, ampMid, ampMid);

      const volume = getRecord(mut['volume']);
      if (volume) {
        jitterRecordField(volume, 'glowIntensity', SAFE_RANGES.glowIntensity, ampMid);
        jitterRecordField(volume, 'backgroundStrength', SAFE_RANGES.backgroundStrength, ampSoft);
        jitterRecordField(volume, 'softness', SAFE_RANGES.softness, ampSoft);
        if ('color' in volume) volume['color'] = jitterColorValue(volume['color'], colorAmp, rng);
      }
      jitterField('glowIntensity', SAFE_RANGES.glowIntensity, ampMid, ampMid);
      jitterField('backgroundStrength', SAFE_RANGES.backgroundStrength, ampSoft, ampSoft);
      jitterField('softness', SAFE_RANGES.softness, ampSoft, ampSoft);

      const opacity = getRecord(mut['opacity']);
      if (opacity) {
        jitterRecordField(opacity, 'wireOpacityMul', SAFE_RANGES.opacityMul, ampSoft);
        jitterRecordField(opacity, 'particlesOpacityMul', SAFE_RANGES.opacityMul, ampSoft);
        const fgAmp = baseName.toLowerCase().includes('cendre') ? ampStrong : ampMid;
        jitterRecordField(opacity, 'foregroundOpacity', SAFE_RANGES.foregroundOpacityMul, fgAmp);
      }
      jitterField('wireOpacityMul', SAFE_RANGES.opacityMul, ampSoft, ampSoft);
      jitterField('particlesOpacityMul', SAFE_RANGES.opacityMul, ampSoft, ampSoft);
      jitterField('foregroundOpacityMul', SAFE_RANGES.foregroundOpacityMul, ampStrong, ampStrong);

      const colors = getRecord(mut['colors']);
      if (colors) {
        if ('fog' in colors) colors['fog'] = jitterColorValue(colors['fog'], colorAmp, rng);
        if ('glow' in colors) colors['glow'] = jitterColorValue(colors['glow'], colorAmp, rng);
        if ('bg' in colors) colors['bg'] = jitterColorValue(colors['bg'], colorAmp, rng);
      }

      variants[name] = v;
    }
  }
  return variants;
}
