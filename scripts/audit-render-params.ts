import fs from "node:fs";
import path from "node:path";
import { ClimateController } from "../src/scene/params/ClimateController";
import { mapClimateToRenderParams } from "../src/scene/render/materials/mapClimateToRenderParams";
import { RenderSafeRanges } from "../src/scene/render/materials/materialParams";
import { computeAlpha, type TransparencyOptions, type TransparencyState } from "../src/scene/render/optics/transparency";

type Row = {
  seed: string;
  mood: string;
  progress: number;
  presetName: string;
  fogDensity: number;
  fogColor: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  glowIntensity: number;
  backgroundStrength: number;
  softness: number;
  vignette: number;
  volumeBgColor: number;
  volumeGlowColor: number;
  wireOpacityMul: number;
  particlesOpacityMul: number;
  foregroundOpacity: number;
  alphaWire: number;
  alphaParticles: number;
  alphaForeground: number;
  opticsAlpha: number;
  opticsTransmission: number;
  opticsThickness: number;
  opticsIor: number;
  opticsRoughness: number;
  opticsClearcoat: number;
  opticsScattering: number;
  opticsAbsorption: number;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function toCsv(rows: Row[]) {
  const headers = Object.keys(rows[0]) as (keyof Row)[];
  const esc = (x: unknown) => {
    const s = String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))];
  return lines.join("\n");
}

const OUT_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve("audit/_latest/render_params");
const PROGRESSES = [0, 0.1, 0.25, 0.5, 0.75, 1];
const SEEDS = ["renderS1", "renderS2", "renderS3", "renderS4", "renderS5", "renderS6"];
const MOODS = ["renderM1", "renderM2", "renderM3", "renderM4", "renderM5", "renderM6"];
const DT_MS = 50;
const TRANSPARENCY_OPTS: TransparencyOptions = {
  minAlpha: 0,
  maxAlpha: 1,
  tauMs: 120,
  hysteresisUp: 0.01,
  hysteresisDown: 0.015,
};

const rows: Row[] = [];
for (const seed of SEEDS) {
  for (const mood of MOODS) {
    const ctrl = new ClimateController({ seed });
    ctrl.setMood(mood);
    let wireState: TransparencyState | null = null;
    let particlesState: TransparencyState | null = null;
    let foregroundState: TransparencyState | null = null;

    for (const p of PROGRESSES) {
      ctrl.setProgress(p);
      ctrl.update(50);

      const targets = ctrl.getTargets();
      const rp = mapClimateToRenderParams(targets);
      const wireResult = computeAlpha(1, rp.optics.alpha, rp.opacity.wireOpacityMul, wireState, DT_MS, TRANSPARENCY_OPTS);
      wireState = wireResult.nextState;
      const particlesResult = computeAlpha(
        1,
        rp.optics.alpha,
        rp.opacity.particlesOpacityMul,
        particlesState,
        DT_MS,
        TRANSPARENCY_OPTS
      );
      particlesState = particlesResult.nextState;
      const foregroundResult = computeAlpha(
        1,
        rp.optics.alpha,
        rp.opacity.foregroundOpacity,
        foregroundState,
        DT_MS,
        TRANSPARENCY_OPTS
      );
      foregroundState = foregroundResult.nextState;

      rows.push({
        seed,
        mood,
        progress: p,
        presetName: rp.presetName,
        fogDensity: rp.fog.density,
        fogColor: rp.fog.color,
        bloomStrength: rp.bloom.strength,
        bloomRadius: rp.bloom.radius,
        bloomThreshold: rp.bloom.threshold,
        glowIntensity: rp.volume.glowIntensity,
        backgroundStrength: rp.volume.backgroundStrength,
        softness: rp.volume.softness,
        vignette: rp.volume.vignette,
        volumeBgColor: rp.volume.bgColor ?? 0,
        volumeGlowColor: rp.volume.glowColor ?? 0,
        wireOpacityMul: rp.opacity.wireOpacityMul,
        particlesOpacityMul: rp.opacity.particlesOpacityMul,
        foregroundOpacity: rp.opacity.foregroundOpacity,
        alphaWire: wireResult.alpha,
        alphaParticles: particlesResult.alpha,
        alphaForeground: foregroundResult.alpha,
        opticsAlpha: rp.optics.alpha,
        opticsTransmission: rp.optics.transmission,
        opticsThickness: rp.optics.thickness,
        opticsIor: rp.optics.ior,
        opticsRoughness: rp.optics.roughness,
        opticsClearcoat: rp.optics.clearcoat,
        opticsScattering: rp.optics.scattering,
        opticsAbsorption: rp.optics.absorption,
      });
    }
  }
}

ensureDir(OUT_DIR);

fs.writeFileSync(
  path.join(OUT_DIR, "render_params.audit.json"),
  JSON.stringify(
    {
      meta: {
        generatedAt: new Date().toISOString(),
        seeds: SEEDS,
        moods: MOODS,
        progresses: PROGRESSES,
        renderSafeRanges: RenderSafeRanges,
      },
      rows,
    },
    null,
    2
  ),
  "utf8"
);

fs.writeFileSync(path.join(OUT_DIR, "render_params.audit.csv"), toCsv(rows), "utf8");
console.log(`[OK] Render params audit written to: ${OUT_DIR}`);
