// scripts/audit-presets.ts
import fs from 'node:fs';
import path from 'node:path';
import { CLIMATE_PRESET_NAMES, ClimateController } from '../src/scene/params/ClimateController';
import { SAFE_RANGES } from '../src/scene/params/presetLibrary';

type Row = {
  presetName: string;
  progress: number;
  fogDensity: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  glowIntensity: number;
  backgroundStrength: number;
  softness: number;
  wireOpacityMul: number;
  particlesOpacityMul: number;
  foregroundOpacity: number;
};

function mustNum(v: any, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} must be finite number`);
  return v;
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function toCsv(rows: Row[]) {
  const headers = Object.keys(rows[0]) as (keyof Row)[];
  const esc = (x: any) => {
    const s = String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ];
  return lines.join('\n');
}

const OUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('audit/_latest/presets');
const PROGRESSES = [0, 0.1, 0.25, 0.5, 0.75, 1];

const seed = 'audit-presets';
const mood = 'audit';

const rows: Row[] = [];
for (const presetName of CLIMATE_PRESET_NAMES) {
  // On cherche une combo (seed/mood) qui "tombe" sur ce preset.
  // => on brute-force leger, c'est un audit, pas un hot path.
  let foundSeed = seed;
  let foundMood = mood;

  outer: for (let i = 0; i <= 220; i++) {
    const s = `aS${i}`;
    const ctrl = new ClimateController({ seed: s });
    for (let j = 0; j <= 220; j++) {
      const m = `aM${j}`;
      ctrl.setMood(m);
      ctrl.setProgress(0.25);
      ctrl.update(1);
      if (ctrl.getTargets().presetName === presetName) {
        foundSeed = s;
        foundMood = m;
        break outer;
      }
    }
  }

  const ctrl = new ClimateController({ seed: foundSeed });
  ctrl.setMood(foundMood);

  for (const p of PROGRESSES) {
    ctrl.setProgress(p);
    ctrl.update(50);
    const t = ctrl.getTargets();

    rows.push({
      presetName,
      progress: p,
      fogDensity: mustNum(t.fog?.density, `${presetName}@${p}.fogDensity`),
      bloomStrength: mustNum(t.bloom?.strength, `${presetName}@${p}.bloomStrength`),
      bloomRadius: mustNum(t.bloom?.radius, `${presetName}@${p}.bloomRadius`),
      bloomThreshold: mustNum(t.bloom?.threshold, `${presetName}@${p}.bloomThreshold`),
      glowIntensity: mustNum(t.volume?.glowIntensity, `${presetName}@${p}.glowIntensity`),
      backgroundStrength: mustNum(t.volume?.backgroundStrength, `${presetName}@${p}.backgroundStrength`),
      softness: mustNum(t.volume?.softness, `${presetName}@${p}.softness`),
      wireOpacityMul: mustNum(t.opacity?.wireOpacityMul, `${presetName}@${p}.wireOpacityMul`),
      particlesOpacityMul: mustNum(t.opacity?.particlesOpacityMul, `${presetName}@${p}.particlesOpacityMul`),
      foregroundOpacity: mustNum(t.opacity?.foregroundOpacity, `${presetName}@${p}.foregroundOpacity`),
    });
  }
}

ensureDir(OUT_DIR);

fs.writeFileSync(
  path.join(OUT_DIR, 'presets.audit.json'),
  JSON.stringify(
    {
      meta: {
        generatedAt: new Date().toISOString(),
        presetCount: CLIMATE_PRESET_NAMES.length,
        progresses: PROGRESSES,
      },
      safeRanges: SAFE_RANGES,
      rows,
    },
    null,
    2
  ),
  'utf8'
);

fs.writeFileSync(path.join(OUT_DIR, 'presets.audit.csv'), toCsv(rows), 'utf8');

console.log(`[OK] Presets audit written to: ${OUT_DIR}`);
