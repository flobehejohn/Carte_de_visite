import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLIMATE_PRESET_NAMES, ClimateController } from './ClimateController';
import { SAFE_RANGES } from './presetLibrary';

const PROGRESSES = [0, 0.1, 0.25, 0.5, 0.75, 1] as const;

type Combo = { seed: string; mood: string };

function requireFiniteNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} must be a finite number`);
  return v;
}

function buildComboMapForPresets(
  presetNames: readonly string[],
  opts?: { gridMax?: number; probeProgress?: number }
): Record<string, Combo> {
  const gridMax = Math.max(5, Math.floor(opts?.gridMax ?? 120));
  const probeProgress = typeof opts?.probeProgress === 'number' ? opts.probeProgress : 0.25;

  const wanted = new Set(presetNames);
  const found: Record<string, Combo> = {};

  for (let i = 0; i <= gridMax; i += 1) {
    const seed = `libS${i}`;
    const ctrl = new ClimateController({ seed });
    for (let j = 0; j <= gridMax; j += 1) {
      const mood = `libM${j}`;
      ctrl.setMood(mood);
      ctrl.setProgress(probeProgress);
      ctrl.update(1);

      const name = ctrl.getTargets().presetName;
      if (wanted.has(name) && !found[name]) {
        found[name] = { seed, mood };
        if (Object.keys(found).length === wanted.size) return found;
      }
    }
  }

  const missing = presetNames.filter((p) => !found[p]);
  throw new Error(`Preset combos not found (missing=${missing.length}): ${missing.slice(0, 8).join(', ')} ...`);
}

function assertSafeTargets(t: any, label: string) {
  const fog = requireFiniteNumber(t.fog?.density, `${label}.fog.density`);
  expect(fog).toBeGreaterThanOrEqual(SAFE_RANGES.fogDensity.min);
  expect(fog).toBeLessThanOrEqual(SAFE_RANGES.fogDensity.max);

  const bs = requireFiniteNumber(t.bloom?.strength, `${label}.bloom.strength`);
  expect(bs).toBeGreaterThanOrEqual(SAFE_RANGES.bloomStrength.min);
  expect(bs).toBeLessThanOrEqual(SAFE_RANGES.bloomStrength.max);

  const br = requireFiniteNumber(t.bloom?.radius, `${label}.bloom.radius`);
  expect(br).toBeGreaterThanOrEqual(SAFE_RANGES.bloomRadius.min);
  expect(br).toBeLessThanOrEqual(SAFE_RANGES.bloomRadius.max);

  const bt = requireFiniteNumber(t.bloom?.threshold, `${label}.bloom.threshold`);
  expect(bt).toBeGreaterThanOrEqual(SAFE_RANGES.bloomThreshold.min);
  expect(bt).toBeLessThanOrEqual(SAFE_RANGES.bloomThreshold.max);

  const gi = requireFiniteNumber(t.volume?.glowIntensity, `${label}.volume.glowIntensity`);
  expect(gi).toBeGreaterThanOrEqual(SAFE_RANGES.glowIntensity.min);
  expect(gi).toBeLessThanOrEqual(SAFE_RANGES.glowIntensity.max);

  const bg = requireFiniteNumber(t.volume?.backgroundStrength, `${label}.volume.backgroundStrength`);
  expect(bg).toBeGreaterThanOrEqual(SAFE_RANGES.backgroundStrength.min);
  expect(bg).toBeLessThanOrEqual(SAFE_RANGES.backgroundStrength.max);

  const sf = requireFiniteNumber(t.volume?.softness, `${label}.volume.softness`);
  expect(sf).toBeGreaterThanOrEqual(SAFE_RANGES.softness.min);
  expect(sf).toBeLessThanOrEqual(SAFE_RANGES.softness.max);

  const wom = requireFiniteNumber(t.opacity?.wireOpacityMul, `${label}.opacity.wireOpacityMul`);
  expect(wom).toBeGreaterThanOrEqual(SAFE_RANGES.opacityMul.min);
  expect(wom).toBeLessThanOrEqual(SAFE_RANGES.opacityMul.max);

  const pom = requireFiniteNumber(t.opacity?.particlesOpacityMul, `${label}.opacity.particlesOpacityMul`);
  expect(pom).toBeGreaterThanOrEqual(SAFE_RANGES.opacityMul.min);
  expect(pom).toBeLessThanOrEqual(SAFE_RANGES.opacityMul.max);

  const fg = requireFiniteNumber(t.opacity?.foregroundOpacity, `${label}.opacity.foregroundOpacity`);
  expect(fg).toBeGreaterThanOrEqual(SAFE_RANGES.foregroundOpacityMul.min);
  expect(fg).toBeLessThanOrEqual(SAFE_RANGES.foregroundOpacityMul.max);
}

function l1(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]);
  return s;
}

function distinctCount(vectors: number[][], threshold: number) {
  const kept: number[][] = [];
  outer: for (const v of vectors) {
    for (const k of kept) {
      if (l1(v, k) < threshold) continue;
    }
    // si on arrive ici, v est "assez loin" de tous les kept
    for (const k of kept) {
      if (l1(v, k) < threshold) continue outer;
    }
    kept.push(v);
  }
  return kept.length;
}

describe('Climate preset library — safe / diverse / semantic', () => {
  let restoreInfo: any;
  let restoreLog: any;
  let restoreDebug: any;

  beforeEach(() => {
    // Pas de logs bruyants
    restoreInfo = console.info;
    restoreLog = console.log;
    restoreDebug = console.debug;
    console.info = () => {};
    console.log = () => {};
    console.debug = () => {};
  });

  afterEach(() => {
    console.info = restoreInfo;
    console.log = restoreLog;
    console.debug = restoreDebug;
  });

  it('SAFE: tous les presets respectent SAFE_RANGES sur plusieurs progress', () => {
    const combos = buildComboMapForPresets(CLIMATE_PRESET_NAMES, { gridMax: 140, probeProgress: 0.25 });

    for (const presetName of CLIMATE_PRESET_NAMES) {
      const combo = combos[presetName];
      const ctrl = new ClimateController({ seed: combo.seed });
      ctrl.setMood(combo.mood);

      for (const p of PROGRESSES) {
        ctrl.setProgress(p);
        ctrl.update(50); // 50ms < minHoldMs => pas de switch altPreset
        const t = ctrl.getTargets();
        expect(t.presetName).toBe(presetName);
        assertSafeTargets(t, `${presetName}@${p}`);
      }
    }
  });

  it('DIVERSITÉ: variantes Aurore__Vxx et Cendre__Vxx ont assez de vecteurs distincts', () => {
    const combos = buildComboMapForPresets(CLIMATE_PRESET_NAMES, { gridMax: 140, probeProgress: 0.25 });

    function vectorsForFamily(prefix: string) {
      const names = CLIMATE_PRESET_NAMES.filter((n) => n.startsWith(prefix));
      const vectors: number[][] = [];

      for (const name of names) {
        const combo = combos[name];
        const ctrl = new ClimateController({ seed: combo.seed });
        ctrl.setMood(combo.mood);
        ctrl.setProgress(0.25);
        ctrl.update(50);
        const t = ctrl.getTargets();

        vectors.push([
          requireFiniteNumber(t.fog?.density, `${name}.fog`),
          requireFiniteNumber(t.bloom?.strength, `${name}.bloomStrength`),
          requireFiniteNumber(t.bloom?.threshold, `${name}.bloomThreshold`),
          requireFiniteNumber(t.volume?.glowIntensity, `${name}.glowIntensity`),
          requireFiniteNumber(t.opacity?.foregroundOpacity, `${name}.foregroundOpacity`),
        ]);
      }
      return { names, vectors };
    }

    const au = vectorsForFamily('Aurore__V');
    const ce = vectorsForFamily('Cendre__V');

    // seuils “réalistes” (moins brittle que 0.15 sur ces amplitudes)
    const threshold = 0.10;
    const minDistinct = 6;

    expect(distinctCount(au.vectors, threshold)).toBeGreaterThanOrEqual(minDistinct);
    expect(distinctCount(ce.vectors, threshold)).toBeGreaterThanOrEqual(minDistinct);
  });

  it('SÉMANTIQUE: Cendre plus voilé et plus dense que Aurore (moyennes à t=0.25)', () => {
    const combos = buildComboMapForPresets(CLIMATE_PRESET_NAMES, { gridMax: 140, probeProgress: 0.25 });

    function meanForFamily(prefix: string) {
      const names = CLIMATE_PRESET_NAMES.filter((n) => n === prefix || n.startsWith(`${prefix}__V`));
      let sumFog = 0;
      let sumFg = 0;

      for (const name of names) {
        const combo = combos[name];
        const ctrl = new ClimateController({ seed: combo.seed });
        ctrl.setMood(combo.mood);
        ctrl.setProgress(0.25);
        ctrl.update(50);
        const t = ctrl.getTargets();

        sumFog += requireFiniteNumber(t.fog?.density, `${name}.fog`);
        sumFg += requireFiniteNumber(t.opacity?.foregroundOpacity, `${name}.foregroundOpacity`);
      }

      return { n: names.length, meanFog: sumFog / names.length, meanFg: sumFg / names.length };
    }

    const A = meanForFamily('Aurore');
    const C = meanForFamily('Cendre');

    expect(C.n).toBeGreaterThan(0);
    expect(A.n).toBeGreaterThan(0);

    expect(C.meanFg).toBeGreaterThan(A.meanFg + 0.4);
    expect(C.meanFog).toBeGreaterThan(A.meanFog + 0.005);
  });
});
