import { describe, expect, it } from 'vitest';
import { buildPresetVariants, SAFE_RANGES, type PresetDefAny } from './presetLibrary';

const MOCK_BASE: Record<string, PresetDefAny> = {
  Aurore: {
    fog: { density: 0.02, color: '#ff0000' },
    bloomStrength: 0.5,
    volume: { glowIntensity: 0.5 },
    opacity: { foregroundOpacity: 0.1 },
  },
  Cendre: {
    fog: { density: 0.05, color: '#0000ff' },
    bloomStrength: 0.2,
    volume: { glowIntensity: 0.2 },
    opacity: { foregroundOpacity: 1.0 },
  },
};

describe('Climate preset variants - unit', () => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function getNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  it('DIVERSITE: Genere des variantes distinctes (Set uniques)', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 50, seed: 'test-seed' });

    const vectors = Object.entries(variants)
      .filter(([k]) => k.startsWith('Cendre__V'))
      .map(([, v]) => {
        const fog = isRecord(v.fog) ? v.fog : null;
        const opacity = isRecord(v.opacity) ? v.opacity : null;
        return [
          getNumber(fog?.density),
          getNumber(v.bloomStrength), // Teste propriete top-level
          getNumber(opacity?.foregroundOpacity),
        ];
      });

    expect(vectors.length).toBe(50);
    const uniqueVectors = new Set(vectors.map((v) => v.join(',')));
    expect(uniqueVectors.size).toBeGreaterThan(10);
  });

  it('SAFE: Toutes les variantes respectent les SAFE_RANGES', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 20, seed: 'safety-check' });

    for (const v of Object.values(variants)) {
      const fog = isRecord(v.fog) ? v.fog : null;
      if (fog && typeof fog.density === 'number') {
        expect(fog.density).toBeGreaterThanOrEqual(SAFE_RANGES.fogDensity.min);
        expect(fog.density).toBeLessThanOrEqual(SAFE_RANGES.fogDensity.max);
      }
      const opacity = isRecord(v.opacity) ? v.opacity : null;
      if (opacity && typeof opacity.foregroundOpacity === 'number') {
        expect(opacity.foregroundOpacity).toBeGreaterThanOrEqual(SAFE_RANGES.foregroundOpacityMul.min);
        expect(opacity.foregroundOpacity).toBeLessThanOrEqual(SAFE_RANGES.foregroundOpacityMul.max);
      }
    }
  });

  it('SEMANTIQUE: Cendre reste plus voile que Aurore', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 100, seed: 'semantic' });

    let sumA = 0, nA = 0;
    let sumC = 0, nC = 0;

    for (const [k, v] of Object.entries(variants)) {
      const opacity = isRecord(v.opacity) ? v.opacity : null;
      const fg = getNumber(opacity?.foregroundOpacity);
      if (k.startsWith('Aurore')) { sumA += fg; nA++; }
      if (k.startsWith('Cendre')) { sumC += fg; nC++; }
    }

    expect(sumC / nC).toBeGreaterThan(sumA / nA + 0.5);
  });
});
