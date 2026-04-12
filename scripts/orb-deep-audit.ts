#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);
const getArg = (name: string, def: any) => {
  const idx = args.findIndex(a => a === `--${name}`);
  if (idx !== -1) {
    const v = args[idx + 1];
    if (v === undefined) return true;
    const num = Number(v);
    return Number.isNaN(num) ? v : num;
  }
  return def;
};

const runs = Number(getArg('runs', 10));
const outPath = String(getArg('out', 'audit/orb_audit_report.txt'));
const rawPath = String(getArg('raw', 'audit/orb_audit_raw.json'));
const baseUrl = String(getArg('url', 'http://localhost:5173'));

mkdirSync('audit', { recursive: true });

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch (_) {}
    await wait(500);
  }
  return false;
}

function startDevServer() {
  const proc = spawn('npm', ['run', 'dev', '--', '--host', '--port', '5173'], {
    shell: true,
    stdio: 'inherit'
  });
  return proc;
}

async function sampleFPS(page: any) {
  try {
    return await page.evaluate(() => {
      return new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        function step(t: number) {
          frames++;
          if (t - start >= 2000) {
            resolve({ frames, duration: t - start, fps: frames / ((t - start) / 1000) });
          } else {
            requestAnimationFrame(step);
          }
        }
        requestAnimationFrame(step);
      });
    });
  } catch (e: any) {
    return { frames: 0, duration: 0, fps: null, error: String(e) };
  }
}

async function runAudit() {
  let devServer: any = null;
  let serverStartedHere = false;
  const serverUp = await waitForServer(baseUrl);
  if (!serverUp) {
    devServer = startDevServer();
    serverStartedHere = true;
    const ok = await waitForServer(baseUrl);
    if (!ok) throw new Error('Dev server not reachable');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-extensions', '--disable-component-extensions-with-background-pages']
  });

  const results: any[] = [];

  for (let i = 0; i < runs; i++) {
    const runId = `AUDIT-${i + 1}-${Date.now()}`;
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();

    const consoleErrors: any[] = [];
    page.on('console', (msg: any) => {
      if (['error'].includes(msg.type())) consoleErrors.push(msg.text());
    });
    const pageErrors: any[] = [];
    page.on('pageerror', (err: any) => pageErrors.push(String(err)));

    let runStatus = 'PASS';
    let snapshots: any[] = [];
    let perf: any = null;
    let env: any = null;

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      await page.waitForFunction(() => (window as any).__ORB_AUDIT__ && (window as any).__ORB_AUDIT__.ready(), { timeout: 20000 });

      await page.evaluate((seed) => (window as any).__ORB_AUDIT__?.setSeed(seed), runId);

      snapshots = [];
      for (let p = 0; p <= 1.0001; p += 0.05) {
        await page.evaluate((val) => (window as any).__ORB_AUDIT__?.setProgress(val), Number(p.toFixed(2)));
        await page.waitForTimeout(250);
        const snap = await page.evaluate(() => (window as any).__ORB_AUDIT__?.snapshot());
        snapshots.push({ progress: Number(p.toFixed(2)), snapshot: snap });
      }

      perf = await sampleFPS(page);
      env = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        const gl: any = canvas.getContext('webgl2') || canvas.getContext('webgl');
        let vendor = null, renderer = null;
        if (gl) {
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
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
      });
    } catch (err: any) {
      runStatus = 'FAIL';
      pageErrors.push(String(err));
    }

    results.push({
      runId,
      env,
      snapshots,
      perf,
      consoleErrors,
      pageErrors,
      runStatus,
    });

    await context.close();
  }

  await browser.close();
  if (serverStartedHere && devServer) devServer.kill('SIGTERM');

  writeFileSync(rawPath, JSON.stringify(results, null, 2), 'utf-8');

  // Build text report
  const lines: string[] = [];
  lines.push(`ORB DEEP AUDIT`);
  lines.push(`Runs: ${runs}`);
  lines.push('');
  lines.push('ENV (from first run):');
  lines.push(JSON.stringify(results[0]?.env ?? {}, null, 2));
  lines.push('');
  results.forEach((r, idx) => {
    const lastSnap = r.snapshots[r.snapshots.length - 1]?.snapshot;
    const warnings = lastSnap?.warnings || [];
    const status = r.runStatus === 'FAIL' || warnings.includes('webgl context lost') || r.pageErrors.length ? 'FAIL' : 'PASS';
    lines.push(`Run ${idx + 1} (${r.runId}) - ${status}`);
    if (warnings.length) lines.push(`  warnings: ${warnings.join(', ')}`);
    if (r.consoleErrors.length) lines.push(`  consoleErrors: ${r.consoleErrors.join(' | ')}`);
    if (r.pageErrors.length) lines.push(`  pageErrors: ${r.pageErrors.join(' | ')}`);
    // Color/Light map (progress -> primaryHex / light intensities)
    lines.push('  COLOR/LIGHT MAP: progress -> primaryHex / lightKey');
    r.snapshots.forEach((s: any) => {
      const hex = s.snapshot?.ritualGenome?.palette?.primary?.hex || 'n/a';
      const lk = s.snapshot?.state?.lightKey ?? 'n/a';
      lines.push(`    p=${s.progress.toFixed(2)} -> ${hex}, lightKey=${lk}`);
    });
    lines.push('  VOLUME/FOG/BLUR/TRANSLUCIDITY MAP:');
    r.snapshots.forEach((s: any) => {
      const vol = s.snapshot?.volumeEffective || {};
      const fog = s.snapshot?.uiWindow?.fog || {};
      const blur = s.snapshot?.uiWindow?.blur || {};
      lines.push(`    p=${s.progress.toFixed(2)} -> bgStrength=${vol.backgroundStrength ?? 'n/a'}, glow=${vol.glowIntensity ?? 'n/a'}, softness=${vol.softness ?? 'n/a'}, fogDensity=${fog.density ?? 'n/a'}, blur=${blur.strength ?? blur.enabled}`);
    });
    lines.push('  PARTICLES EVOLUTION:');
    r.snapshots.forEach((s: any) => {
      const pr = s.snapshot?.particlesRuntime || {};
      lines.push(`    p=${s.progress.toFixed(2)} -> mode=${pr.mode} count=${pr.count} linkDistance=${pr.linkDistance}`);
    });
    lines.push('  PERF (approx FPS over 2s): ' + (r.perf?.fps ? r.perf.fps.toFixed(1) : 'n/a'));
    lines.push('');
  });

  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log('[AUDIT] report written to', outPath);
}

runAudit().catch((err) => {
  console.error('[AUDIT] failed', err);
  process.exit(1);
});
