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
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
Object.defineProperty(exports, "__esModule", { value: true });
// scripts/audit-presets.ts
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var ClimateController_1 = require("../src/scene/params/ClimateController");
var presetLibrary_1 = require("../src/scene/params/presetLibrary");
function mustNum(v, label) {
    if (typeof v !== 'number' || !Number.isFinite(v))
        throw new Error("".concat(label, " must be finite number"));
    return v;
}
function ensureDir(p) {
    node_fs_1.default.mkdirSync(p, { recursive: true });
}
function toCsv(rows) {
    var headers = Object.keys(rows[0]);
    var esc = function (x) {
        var s = String(x);
        return /[",\n]/.test(s) ? "\"".concat(s.replace(/"/g, '""'), "\"") : s;
    };
    var lines = __spreadArray([
        headers.join(',')
    ], rows.map(function (r) { return headers.map(function (h) { return esc(r[h]); }).join(','); }), true);
    return lines.join('\n');
}
var OUT_DIR = process.argv[2] ? node_path_1.default.resolve(process.argv[2]) : node_path_1.default.resolve('audit/_latest/presets');
var PROGRESSES = [0, 0.1, 0.25, 0.5, 0.75, 1];
var seed = 'audit-presets';
var mood = 'audit';
var rows = [];
for (var _i = 0, CLIMATE_PRESET_NAMES_1 = ClimateController_1.CLIMATE_PRESET_NAMES; _i < CLIMATE_PRESET_NAMES_1.length; _i++) {
    var presetName = CLIMATE_PRESET_NAMES_1[_i];
    // On cherche une combo (seed/mood) qui "tombe" sur ce preset.
    // => on brute-force leger, c'est un audit, pas un hot path.
    var foundSeed = seed;
    var foundMood = mood;
    outer: for (var i = 0; i <= 220; i++) {
        var s = "aS".concat(i);
        var ctrl_1 = new ClimateController_1.ClimateController({ seed: s });
        for (var j = 0; j <= 220; j++) {
            var m = "aM".concat(j);
            ctrl_1.setMood(m);
            ctrl_1.setProgress(0.25);
            ctrl_1.update(1);
            if (ctrl_1.getTargets().presetName === presetName) {
                foundSeed = s;
                foundMood = m;
                break outer;
            }
        }
    }
    var ctrl = new ClimateController_1.ClimateController({ seed: foundSeed });
    ctrl.setMood(foundMood);
    for (var _l = 0, PROGRESSES_1 = PROGRESSES; _l < PROGRESSES_1.length; _l++) {
        var p = PROGRESSES_1[_l];
        ctrl.setProgress(p);
        ctrl.update(50);
        var t = ctrl.getTargets();
        rows.push({
            presetName: presetName,
            progress: p,
            fogDensity: mustNum((_a = t.fog) === null || _a === void 0 ? void 0 : _a.density, "".concat(presetName, "@").concat(p, ".fogDensity")),
            bloomStrength: mustNum((_b = t.bloom) === null || _b === void 0 ? void 0 : _b.strength, "".concat(presetName, "@").concat(p, ".bloomStrength")),
            bloomRadius: mustNum((_c = t.bloom) === null || _c === void 0 ? void 0 : _c.radius, "".concat(presetName, "@").concat(p, ".bloomRadius")),
            bloomThreshold: mustNum((_d = t.bloom) === null || _d === void 0 ? void 0 : _d.threshold, "".concat(presetName, "@").concat(p, ".bloomThreshold")),
            glowIntensity: mustNum((_e = t.volume) === null || _e === void 0 ? void 0 : _e.glowIntensity, "".concat(presetName, "@").concat(p, ".glowIntensity")),
            backgroundStrength: mustNum((_f = t.volume) === null || _f === void 0 ? void 0 : _f.backgroundStrength, "".concat(presetName, "@").concat(p, ".backgroundStrength")),
            softness: mustNum((_g = t.volume) === null || _g === void 0 ? void 0 : _g.softness, "".concat(presetName, "@").concat(p, ".softness")),
            wireOpacityMul: mustNum((_h = t.opacity) === null || _h === void 0 ? void 0 : _h.wireOpacityMul, "".concat(presetName, "@").concat(p, ".wireOpacityMul")),
            particlesOpacityMul: mustNum((_j = t.opacity) === null || _j === void 0 ? void 0 : _j.particlesOpacityMul, "".concat(presetName, "@").concat(p, ".particlesOpacityMul")),
            foregroundOpacity: mustNum((_k = t.opacity) === null || _k === void 0 ? void 0 : _k.foregroundOpacity, "".concat(presetName, "@").concat(p, ".foregroundOpacity")),
        });
    }
}
ensureDir(OUT_DIR);
node_fs_1.default.writeFileSync(node_path_1.default.join(OUT_DIR, 'presets.audit.json'), JSON.stringify({
    meta: {
        generatedAt: new Date().toISOString(),
        presetCount: ClimateController_1.CLIMATE_PRESET_NAMES.length,
        progresses: PROGRESSES,
    },
    safeRanges: presetLibrary_1.SAFE_RANGES,
    rows: rows,
}, null, 2), 'utf8');
node_fs_1.default.writeFileSync(node_path_1.default.join(OUT_DIR, 'presets.audit.csv'), toCsv(rows), 'utf8');
console.log("[OK] Presets audit written to: ".concat(OUT_DIR));
