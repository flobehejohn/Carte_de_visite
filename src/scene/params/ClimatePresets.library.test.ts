import { describe, it, expect } from 'vitest';
import { buildPresetVariants, SAFE_RANGES } from './presetLibrary';
import { ClimatePresetDef } from './presetLibrary'; // Utilise le type local

// Mock de presets de base pour le test
const MOCK_BASE: Record<string, ClimatePresetDef> = {
  'Aurore': {
    fog: { density: 0.02, color: '#ff0000' },
    bloom: { strength: 0.5, radius: 0.5, threshold: 0.8 },
    volume: { glowIntensity: 0.5, backgroundStrength: 0.5, softness: 0.5, color: '#000000' },
    opacity: { foregroundOpacity: 0.1 }
  },
  'Cendre': {
    fog: { density: 0.05, color: '#0000ff' },
    bloom: { strength: 0.2, radius: 0.2, threshold: 0.9 },
    volume: { glowIntensity: 0.2, backgroundStrength: 0.2, softness: 0.2, color: '#ffffff' },
    opacity: { foregroundOpacity: 1.0 }
  }
};

describe('Climate preset library — Unit Test', () => {
  
  it('DIVERSITÉ: Génère des variantes distinctes (Distance L1)', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 50, seed: 'test-seed' });
    
    // Extrait les valeurs clés pour Cendre__Vxx
    const vectors = Object.entries(variants)
      .filter(([k]) => k.startsWith('Cendre__V'))
      .map(([_, v]) => [
        v.fog?.density ?? 0,
        v.bloom?.strength ?? 0,
        v.opacity?.foregroundOpacity ?? 0
      ]);

    // Vérifie qu'on a bien généré 50 variantes
    expect(vectors.length).toBe(50);

    // Vérifie qu'il y a de la diversité (pas 50 fois le même vecteur)
    const uniqueVectors = new Set(vectors.map(v => v.join(',')));
    expect(uniqueVectors.size).toBeGreaterThan(10); // Au moins 10 variantes uniques sur 50
  });

  it('SAFE: Toutes les variantes respectent les SAFE_RANGES', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 20, seed: 'safety-check' });
    
    Object.values(variants).forEach(v => {
      if (v.fog) {
        expect(v.fog.density).toBeGreaterThanOrEqual(SAFE_RANGES.fogDensity.min);
        expect(v.fog.density).toBeLessThanOrEqual(SAFE_RANGES.fogDensity.max);
      }
      if (v.opacity?.foregroundOpacity !== undefined) {
        expect(v.opacity.foregroundOpacity).toBeGreaterThanOrEqual(SAFE_RANGES.foregroundOpacityMul.min);
        expect(v.opacity.foregroundOpacity).toBeLessThanOrEqual(SAFE_RANGES.foregroundOpacityMul.max);
      }
    });
  });

  it('SÉMANTIQUE: Cendre reste plus "Cendre" que Aurore', () => {
    const variants = buildPresetVariants(MOCK_BASE, { perBase: 100, seed: 'semantic' });
    
    // Moyenne Aurore vs Cendre
    let sumAurore = 0, countAurore = 0;
    let sumCendre = 0, countCendre = 0;

    Object.entries(variants).forEach(([k, v]) => {
      const fg = v.opacity?.foregroundOpacity ?? 0;
      if (k.startsWith('Aurore')) { sumAurore += fg; countAurore++; }
      if (k.startsWith('Cendre')) { sumCendre += fg; countCendre++; }
    });

    const meanAurore = sumAurore / countAurore;
    const meanCendre = sumCendre / countCendre;

    // Cendre (base 1.0) doit rester bien plus haut que Aurore (base 0.1) malgré le jitter
    expect(meanCendre).toBeGreaterThan(meanAurore + 0.5);
  });
});
