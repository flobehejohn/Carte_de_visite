"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var ClimateController_1 = require("../src/scene/params/ClimateController");
var mapClimateToRenderParams_1 = require("../src/scene/render/materials/mapClimateToRenderParams");
var materialParams_1 = require("../src/scene/render/materials/materialParams");
var transparency_1 = require("../src/scene/render/optics/transparency");
function ensureDir(p) {
    node_fs_1.default.mkdirSync(p, { recursive: true });
}
function toCsv(rows) {
    var headers = Object.keys(rows[0]);
    var esc = function (x) {
        var s = String(x);
        return /[",\n]/.test(s) ? "\"".concat(s.replace(/"/g, '""'), "\"") : s;
    };
    var lines = __spreadArray([headers.join(",")], rows.map(function (r) { return headers.map(function (h) { return esc(r[h]); }).join(","); }), true);
    return lines.join("\n");
}
var OUT_DIR = process.argv[2] ? node_path_1.default.resolve(process.argv[2]) : node_path_1.default.resolve("audit/_latest/render_params");
var PROGRESSES = [0, 0.1, 0.25, 0.5, 0.75, 1];
var SEEDS = ["renderS1", "renderS2", "renderS3", "renderS4", "renderS5", "renderS6"];
var MOODS = ["renderM1", "renderM2", "renderM3", "renderM4", "renderM5", "renderM6"];
var DT_MS = 50;
var TRANSPARENCY_OPTS = {
    minAlpha: 0,
    maxAlpha: 1,
    tauMs: 120,
    hysteresisUp: 0.01,
    hysteresisDown: 0.015,
};
var rows = [];
for (var _i = 0, SEEDS_1 = SEEDS; _i < SEEDS_1.length; _i++) {
    var seed = SEEDS_1[_i];
    for (var _c = 0, MOODS_1 = MOODS; _c < MOODS_1.length; _c++) {
        var mood = MOODS_1[_c];
        var ctrl = new ClimateController_1.ClimateController({ seed: seed });
        ctrl.setMood(mood);
        var wireState = null;
        var particlesState = null;
        var foregroundState = null;
        for (var _d = 0, PROGRESSES_1 = PROGRESSES; _d < PROGRESSES_1.length; _d++) {
            var p = PROGRESSES_1[_d];
            ctrl.setProgress(p);
            ctrl.update(50);
            var targets = ctrl.getTargets();
            var rp = (0, mapClimateToRenderParams_1.mapClimateToRenderParams)(targets);
            var wireResult = (0, transparency_1.computeAlpha)(1, rp.optics.alpha, rp.opacity.wireOpacityMul, wireState, DT_MS, TRANSPARENCY_OPTS);
            wireState = wireResult.nextState;
            var particlesResult = (0, transparency_1.computeAlpha)(1, rp.optics.alpha, rp.opacity.particlesOpacityMul, particlesState, DT_MS, TRANSPARENCY_OPTS);
            particlesState = particlesResult.nextState;
            var foregroundResult = (0, transparency_1.computeAlpha)(1, rp.optics.alpha, rp.opacity.foregroundOpacity, foregroundState, DT_MS, TRANSPARENCY_OPTS);
            foregroundState = foregroundResult.nextState;
            rows.push({
                seed: seed,
                mood: mood,
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
                volumeBgColor: (_a = rp.volume.bgColor) !== null && _a !== void 0 ? _a : 0,
                volumeGlowColor: (_b = rp.volume.glowColor) !== null && _b !== void 0 ? _b : 0,
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
node_fs_1.default.writeFileSync(node_path_1.default.join(OUT_DIR, "render_params.audit.json"), JSON.stringify({
    meta: {
        generatedAt: new Date().toISOString(),
        seeds: SEEDS,
        moods: MOODS,
        progresses: PROGRESSES,
        renderSafeRanges: materialParams_1.RenderSafeRanges,
    },
    rows: rows,
}, null, 2), "utf8");
node_fs_1.default.writeFileSync(node_path_1.default.join(OUT_DIR, "render_params.audit.csv"), toCsv(rows), "utf8");
console.log("[OK] Render params audit written to: ".concat(OUT_DIR));
