import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function getAllAuditDirs(testInfo: any): string[] {
  const dirs = new Set<string>();

  const fromEnv = process.env.ORB_FLICKER_AUDIT_OUTDIR?.trim();
  if (fromEnv) dirs.add(fromEnv);

  if (testInfo?.outputDir) dirs.add(testInfo.outputDir);

  dirs.add(path.join(process.cwd(), 'audit', '_latest', 'playwright_fallback'));

  for (const dir of dirs) ensureDir(dir);
  return [...dirs];
}

function writeAll(dirs: string[], fileName: string, content: string): string[] {
  const written: string[] = [];
  for (const dir of dirs) {
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, content, 'utf8');
    written.push(filePath);
  }
  return written;
}

async function readSnapshot(page: any) {
  return await page.evaluate(() => {
    const audit = (window as any).__ORB_AUDIT__;
    if (!audit || typeof audit.snapshot !== 'function') {
      throw new Error('__ORB_AUDIT__.snapshot unavailable');
    }
    return audit.snapshot();
  });
}

test('audit particle flicker via audit bridge', async ({ page, browserName }, testInfo) => {
  const dirs = getAllAuditDirs(testInfo);
  const baseName = `${browserName}-particle-flicker-report`;

  const report: any = {
    browserName,
    startedAt: new Date().toISOString(),
    url: process.env.ORB_FLICKER_AUDIT_URL || 'http://127.0.0.1:4173',
    dirs,
    status: 'running',
    highPhase: [],
    safePhase: [],
    errors: [],
  };

  writeAll(
    dirs,
    `${baseName}.start.txt`,
    [
      `browser=${browserName}`,
      `startedAt=${report.startedAt}`,
      `url=${report.url}`,
      `dirs=${dirs.join(' | ')}`,
    ].join('\n'),
  );

  try {
    await page.goto(report.url, { waitUntil: 'networkidle' });

    await page.waitForFunction(() => {
      const audit = (window as any).__ORB_AUDIT__;
      return !!audit && typeof audit.ready === 'function' && audit.ready();
    }, null, { timeout: 30000 });

    await page.evaluate(() => {
      const audit = (window as any).__ORB_AUDIT__;
      audit.setSeed?.('pass15-audit');
      audit.setProgress?.(0.78);
      audit.setFluidParticlesVisible?.(true);
      audit.setQualityProfile?.('high');
    });

    await page.waitForTimeout(1200);

    for (let i = 0; i < 40; i += 1) {
      const snap = await readSnapshot(page);
      report.highPhase.push({
        i,
        qualityProfile: snap?.qualityProfile ?? null,
        qualityProfiles: snap?.qualityProfiles ?? null,
        fluidMetrics: snap?.fluidMetrics ?? null,
        particlesRuntime: snap?.particlesRuntime ?? null,
        renderMode: snap?.renderMode ?? null,
      });
      await page.waitForTimeout(120);
    }

    await page.evaluate(() => {
      const audit = (window as any).__ORB_AUDIT__;
      audit.setQualityProfile?.('safe');
    });

    await page.waitForTimeout(1200);

    for (let i = 0; i < 24; i += 1) {
      const snap = await readSnapshot(page);
      report.safePhase.push({
        i,
        qualityProfile: snap?.qualityProfile ?? null,
        qualityProfiles: snap?.qualityProfiles ?? null,
        fluidMetrics: snap?.fluidMetrics ?? null,
        particlesRuntime: snap?.particlesRuntime ?? null,
        renderMode: snap?.renderMode ?? null,
      });
      await page.waitForTimeout(120);
    }

    const rebuildCounts = report.safePhase.map((x: any) => Number(x?.fluidMetrics?.rebuildCount ?? 0));
    const firstRebuild = rebuildCounts.length > 0 ? rebuildCounts[0] : 0;
    const lastRebuild = rebuildCounts.length > 0 ? rebuildCounts[rebuildCounts.length - 1] : 0;
    const downgradeRebuilds = Math.max(0, lastRebuild - firstRebuild);

    report.summary = {
      highSamples: report.highPhase.length,
      safeSamples: report.safePhase.length,
      firstSafeRebuildCount: firstRebuild,
      lastSafeRebuildCount: lastRebuild,
      downgradeRebuilds,
      lastSafeQualityProfile:
        report.safePhase.length > 0 ? report.safePhase[report.safePhase.length - 1].qualityProfile : null,
      lastSafeFluidMetrics:
        report.safePhase.length > 0 ? report.safePhase[report.safePhase.length - 1].fluidMetrics : null,
    };

    report.status = 'ok';

    const jsonPaths = writeAll(dirs, `${baseName}.json`, JSON.stringify(report, null, 2));
    const txtPaths = writeAll(
      dirs,
      `${baseName}.txt`,
      [
        `browser=${browserName}`,
        `status=${report.status}`,
        `highSamples=${report.summary.highSamples}`,
        `safeSamples=${report.summary.safeSamples}`,
        `downgradeRebuilds=${report.summary.downgradeRebuilds}`,
        `lastSafeQualityProfile=${report.summary.lastSafeQualityProfile}`,
      ].join('\n'),
    );

    await testInfo.attach(`${browserName}-particle-flicker-report`, {
      path: jsonPaths[0],
      contentType: 'application/json',
    });

    console.log(`[FLICKER_AUDIT] json=${jsonPaths.join(' | ')}`);
    console.log(`[FLICKER_AUDIT] txt=${txtPaths.join(' | ')}`);

    expect(downgradeRebuilds, JSON.stringify(report.summary, null, 2)).toBe(0);
  } catch (err: any) {
    report.status = 'error';
    report.errors.push(String(err?.stack || err?.message || err));

    const jsonPaths = writeAll(dirs, `${baseName}.json`, JSON.stringify(report, null, 2));
    const txtPaths = writeAll(
      dirs,
      `${baseName}.txt`,
      [
        `browser=${browserName}`,
        `status=${report.status}`,
        `error=${report.errors[0] ?? 'unknown'}`,
      ].join('\n'),
    );

    console.log(`[FLICKER_AUDIT] json=${jsonPaths.join(' | ')}`);
    console.log(`[FLICKER_AUDIT] txt=${txtPaths.join(' | ')}`);
    throw err;
  }
});
