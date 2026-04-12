#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var playwright_1 = require("playwright");
var child_process_1 = require("child_process");
var fs_1 = require("fs");
var args = process.argv.slice(2);
var getArg = function (name, def) {
    var idx = args.findIndex(function (a) { return a === "--".concat(name); });
    if (idx !== -1) {
        var v = args[idx + 1];
        if (v === undefined)
            return true;
        var num = Number(v);
        return Number.isNaN(num) ? v : num;
    }
    return def;
};
var runs = Number(getArg('runs', 10));
var outPath = String(getArg('out', 'audit/orb_audit_report.txt'));
var rawPath = String(getArg('raw', 'audit/orb_audit_raw.json'));
var baseUrl = String(getArg('url', 'http://localhost:5173'));
(0, fs_1.mkdirSync)('audit', { recursive: true });
function wait(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function waitForServer(url_1) {
    return __awaiter(this, arguments, void 0, function (url, timeoutMs) {
        var start, res, _1;
        if (timeoutMs === void 0) { timeoutMs = 60000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    start = Date.now();
                    _a.label = 1;
                case 1:
                    if (!(Date.now() - start < timeoutMs)) return [3 /*break*/, 7];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, fetch(url, { method: 'GET' })];
                case 3:
                    res = _a.sent();
                    if (res.ok)
                        return [2 /*return*/, true];
                    return [3 /*break*/, 5];
                case 4:
                    _1 = _a.sent();
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, wait(500)];
                case 6:
                    _a.sent();
                    return [3 /*break*/, 1];
                case 7: return [2 /*return*/, false];
            }
        });
    });
}
function startDevServer() {
    var proc = (0, child_process_1.spawn)('npm', ['run', 'dev', '--', '--host', '--port', '5173'], {
        shell: true,
        stdio: 'inherit'
    });
    return proc;
}
function sampleFPS(page) {
    return __awaiter(this, void 0, void 0, function () {
        var e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, page.evaluate(function () {
                            return new Promise(function (resolve) {
                                var frames = 0;
                                var start = performance.now();
                                function step(t) {
                                    frames++;
                                    if (t - start >= 2000) {
                                        resolve({ frames: frames, duration: t - start, fps: frames / ((t - start) / 1000) });
                                    }
                                    else {
                                        requestAnimationFrame(step);
                                    }
                                }
                                requestAnimationFrame(step);
                            });
                        })];
                case 1: return [2 /*return*/, _a.sent()];
                case 2:
                    e_1 = _a.sent();
                    return [2 /*return*/, { frames: 0, duration: 0, fps: null, error: String(e_1) }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function runAudit() {
    return __awaiter(this, void 0, void 0, function () {
        var devServer, serverStartedHere, serverUp, ok, browser, results, _loop_1, i, lines;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    devServer = null;
                    serverStartedHere = false;
                    return [4 /*yield*/, waitForServer(baseUrl)];
                case 1:
                    serverUp = _c.sent();
                    if (!!serverUp) return [3 /*break*/, 3];
                    devServer = startDevServer();
                    serverStartedHere = true;
                    return [4 /*yield*/, waitForServer(baseUrl)];
                case 2:
                    ok = _c.sent();
                    if (!ok)
                        throw new Error('Dev server not reachable');
                    _c.label = 3;
                case 3: return [4 /*yield*/, playwright_1.chromium.launch({
                        headless: true,
                        args: ['--disable-extensions', '--disable-component-extensions-with-background-pages']
                    })];
                case 4:
                    browser = _c.sent();
                    results = [];
                    _loop_1 = function (i) {
                        var runId, context, page, consoleErrors, pageErrors, runStatus, snapshots, perf, env, p, snap, err_1;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    runId = "AUDIT-".concat(i + 1, "-").concat(Date.now());
                                    return [4 /*yield*/, browser.newContext({ viewport: { width: 1280, height: 720 } })];
                                case 1:
                                    context = _d.sent();
                                    return [4 /*yield*/, context.newPage()];
                                case 2:
                                    page = _d.sent();
                                    consoleErrors = [];
                                    page.on('console', function (msg) {
                                        if (['error'].includes(msg.type()))
                                            consoleErrors.push(msg.text());
                                    });
                                    pageErrors = [];
                                    page.on('pageerror', function (err) { return pageErrors.push(String(err)); });
                                    runStatus = 'PASS';
                                    snapshots = [];
                                    perf = null;
                                    env = null;
                                    _d.label = 3;
                                case 3:
                                    _d.trys.push([3, 15, , 16]);
                                    return [4 /*yield*/, page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })];
                                case 4:
                                    _d.sent();
                                    return [4 /*yield*/, page.waitForFunction(function () { return window.__ORB_AUDIT__ && window.__ORB_AUDIT__.ready(); }, { timeout: 20000 })];
                                case 5:
                                    _d.sent();
                                    return [4 /*yield*/, page.evaluate(function (seed) { var _a; return (_a = window.__ORB_AUDIT__) === null || _a === void 0 ? void 0 : _a.setSeed(seed); }, runId)];
                                case 6:
                                    _d.sent();
                                    snapshots = [];
                                    p = 0;
                                    _d.label = 7;
                                case 7:
                                    if (!(p <= 1.0001)) return [3 /*break*/, 12];
                                    return [4 /*yield*/, page.evaluate(function (val) { var _a; return (_a = window.__ORB_AUDIT__) === null || _a === void 0 ? void 0 : _a.setProgress(val); }, Number(p.toFixed(2)))];
                                case 8:
                                    _d.sent();
                                    return [4 /*yield*/, page.waitForTimeout(250)];
                                case 9:
                                    _d.sent();
                                    return [4 /*yield*/, page.evaluate(function () { var _a; return (_a = window.__ORB_AUDIT__) === null || _a === void 0 ? void 0 : _a.snapshot(); })];
                                case 10:
                                    snap = _d.sent();
                                    snapshots.push({ progress: Number(p.toFixed(2)), snapshot: snap });
                                    _d.label = 11;
                                case 11:
                                    p += 0.05;
                                    return [3 /*break*/, 7];
                                case 12: return [4 /*yield*/, sampleFPS(page)];
                                case 13:
                                    perf = _d.sent();
                                    return [4 /*yield*/, page.evaluate(function () {
                                            var canvas = document.createElement('canvas');
                                            var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                                            var vendor = null, renderer = null;
                                            if (gl) {
                                                var dbg = gl.getExtension('WEBGL_debug_renderer_info');
                                                if (dbg) {
                                                    vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
                                                    renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                                                }
                                            }
                                            return {
                                                userAgent: navigator.userAgent,
                                                dpr: window.devicePixelRatio,
                                                viewport: { w: window.innerWidth, h: window.innerHeight },
                                                webglVendor: vendor,
                                                webglRenderer: renderer,
                                            };
                                        })];
                                case 14:
                                    env = _d.sent();
                                    return [3 /*break*/, 16];
                                case 15:
                                    err_1 = _d.sent();
                                    runStatus = 'FAIL';
                                    pageErrors.push(String(err_1));
                                    return [3 /*break*/, 16];
                                case 16:
                                    results.push({
                                        runId: runId,
                                        env: env,
                                        snapshots: snapshots,
                                        perf: perf,
                                        consoleErrors: consoleErrors,
                                        pageErrors: pageErrors,
                                        runStatus: runStatus,
                                    });
                                    return [4 /*yield*/, context.close()];
                                case 17:
                                    _d.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _c.label = 5;
                case 5:
                    if (!(i < runs)) return [3 /*break*/, 8];
                    return [5 /*yield**/, _loop_1(i)];
                case 6:
                    _c.sent();
                    _c.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 5];
                case 8: return [4 /*yield*/, browser.close()];
                case 9:
                    _c.sent();
                    if (serverStartedHere && devServer)
                        devServer.kill('SIGTERM');
                    (0, fs_1.writeFileSync)(rawPath, JSON.stringify(results, null, 2), 'utf-8');
                    lines = [];
                    lines.push("ORB DEEP AUDIT");
                    lines.push("Runs: ".concat(runs));
                    lines.push('');
                    lines.push('ENV (from first run):');
                    lines.push(JSON.stringify((_b = (_a = results[0]) === null || _a === void 0 ? void 0 : _a.env) !== null && _b !== void 0 ? _b : {}, null, 2));
                    lines.push('');
                    results.forEach(function (r, idx) {
                        var _a, _b;
                        var lastSnap = (_a = r.snapshots[r.snapshots.length - 1]) === null || _a === void 0 ? void 0 : _a.snapshot;
                        var warnings = (lastSnap === null || lastSnap === void 0 ? void 0 : lastSnap.warnings) || [];
                        var status = r.runStatus === 'FAIL' || warnings.includes('webgl context lost') || r.pageErrors.length ? 'FAIL' : 'PASS';
                        lines.push("Run ".concat(idx + 1, " (").concat(r.runId, ") - ").concat(status));
                        if (warnings.length)
                            lines.push("  warnings: ".concat(warnings.join(', ')));
                        if (r.consoleErrors.length)
                            lines.push("  consoleErrors: ".concat(r.consoleErrors.join(' | ')));
                        if (r.pageErrors.length)
                            lines.push("  pageErrors: ".concat(r.pageErrors.join(' | ')));
                        // Color/Light map (progress -> primaryHex / light intensities)
                        lines.push('  COLOR/LIGHT MAP: progress -> primaryHex / lightKey');
                        r.snapshots.forEach(function (s) {
                            var _a, _b, _c, _d, _e, _f, _g;
                            var hex = ((_d = (_c = (_b = (_a = s.snapshot) === null || _a === void 0 ? void 0 : _a.ritualGenome) === null || _b === void 0 ? void 0 : _b.palette) === null || _c === void 0 ? void 0 : _c.primary) === null || _d === void 0 ? void 0 : _d.hex) || 'n/a';
                            var lk = (_g = (_f = (_e = s.snapshot) === null || _e === void 0 ? void 0 : _e.state) === null || _f === void 0 ? void 0 : _f.lightKey) !== null && _g !== void 0 ? _g : 'n/a';
                            lines.push("    p=".concat(s.progress.toFixed(2), " -> ").concat(hex, ", lightKey=").concat(lk));
                        });
                        lines.push('  VOLUME/FOG/BLUR/TRANSLUCIDITY MAP:');
                        r.snapshots.forEach(function (s) {
                            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                            var vol = ((_a = s.snapshot) === null || _a === void 0 ? void 0 : _a.volumeEffective) || {};
                            var fog = ((_c = (_b = s.snapshot) === null || _b === void 0 ? void 0 : _b.uiWindow) === null || _c === void 0 ? void 0 : _c.fog) || {};
                            var blur = ((_e = (_d = s.snapshot) === null || _d === void 0 ? void 0 : _d.uiWindow) === null || _e === void 0 ? void 0 : _e.blur) || {};
                            lines.push("    p=".concat(s.progress.toFixed(2), " -> bgStrength=").concat((_f = vol.backgroundStrength) !== null && _f !== void 0 ? _f : 'n/a', ", glow=").concat((_g = vol.glowIntensity) !== null && _g !== void 0 ? _g : 'n/a', ", softness=").concat((_h = vol.softness) !== null && _h !== void 0 ? _h : 'n/a', ", fogDensity=").concat((_j = fog.density) !== null && _j !== void 0 ? _j : 'n/a', ", blur=").concat((_k = blur.strength) !== null && _k !== void 0 ? _k : blur.enabled));
                        });
                        lines.push('  PARTICLES EVOLUTION:');
                        r.snapshots.forEach(function (s) {
                            var _a;
                            var pr = ((_a = s.snapshot) === null || _a === void 0 ? void 0 : _a.particlesRuntime) || {};
                            lines.push("    p=".concat(s.progress.toFixed(2), " -> mode=").concat(pr.mode, " count=").concat(pr.count, " linkDistance=").concat(pr.linkDistance));
                        });
                        lines.push('  PERF (approx FPS over 2s): ' + (((_b = r.perf) === null || _b === void 0 ? void 0 : _b.fps) ? r.perf.fps.toFixed(1) : 'n/a'));
                        lines.push('');
                    });
                    (0, fs_1.writeFileSync)(outPath, lines.join('\n'), 'utf-8');
                    console.log('[AUDIT] report written to', outPath);
                    return [2 /*return*/];
            }
        });
    });
}
runAudit().catch(function (err) {
    console.error('[AUDIT] failed', err);
    process.exit(1);
});
