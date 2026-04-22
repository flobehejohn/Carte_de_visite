const fs = require('node:fs');
const path = require('node:path');

const repo = process.cwd();
const auditDir = process.env.ORB_FLICKER_AUDIT_OUTDIR
  ? path.resolve(process.env.ORB_FLICKER_AUDIT_OUTDIR)
  : path.join(repo, 'audit', '_latest', 'playwright_direct_fallback');

const url = process.env.ORB_FLICKER_AUDIT_URL || 'http://127.0.0.1:4173';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, data) {
  writeText(filePath, JSON.stringify(data, null, 2));
}

ensureDir(auditDir);

const startFile = path.join(auditDir, 'runner-start.txt');
writeText(
  startFile,
  [
    `startedAt=${new Date().toISOString()}`,
    `repo=${repo}`,
    `auditDir=${auditDir}`,
    `url=${url}`,
    `node=${process.version}`,
  ].join('\n'),
);

process.on('uncaughtException', (err) => {
  writeText(
    path.join(auditDir, 'runner-fatal.log'),
    String(err?.stack || err?.message || err),
  );
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  writeText(
    path.join(auditDir, 'runner-fatal.log'),
    String(err?.stack || err?.message || err),
  );
  process.exit(1);
});

async function collectPhase(page, bucket, count, waitMs) {
  for (let i = 0; i < count; i += 1) {
    const snap = await page.evaluate(() => {
      const audit = window.__ORB_AUDIT__;
      if (!audit || typeof audit.snapshot !== 'function') {
        throw new Error('__ORB_AUDIT__.snapshot unavailable');
      }
      return audit.snapshot();
    });

    bucket.push({
      i,
      qualityProfile: snap?.qualityProfile ?? null,
      qualityProfiles: snap?.qualityProfiles ?? null,
      fluidMetrics: snap?.fluidMetrics ?? null,
      particlesRuntime: snap?.particlesRuntime ?? null,
      renderMode: snap?.renderMode ?? null,
      warnings: snap?.warnings ?? null,
    });

    await page.waitForTimeout(waitMs);
  }
}

async function runBrowser(browserName, browserType) {
  const browserLog = [];
  const report = {
    browserName,
    startedAt: new Date().toISOString(),
    url,
    status: 'running',
    highPhase: [],
    safePhase: [],
    errors: [],
    console: browserLog,
  };

  const jsonPath = path.join(auditDir, `${browserName}-particle-flicker-report.json`);
  const txtPath = path.join(auditDir, `${browserName}-particle-flicker-report.txt`);
  const logPath = path.join(auditDir, `playwright-${browserName}.log`);

  let browser;
  try {
    browser = await browserType.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', (msg) => {
      browserLog.push(`[console:${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
      browserLog.push(`[pageerror] ${err?.stack || err?.message || String(err)}`);
    });

    await page.goto(url, { waitUntil: 'networkidle' });

    await page.waitForFunction(() => {
      const audit = window.__ORB_AUDIT__;
      return !!audit && typeof audit.ready === 'function' && audit.ready();
    }, null, { timeout: 30000 });

    await page.evaluate(() => {
      const audit = window.__ORB_AUDIT__;
      audit.setSeed?.('pass15-audit');
      audit.setProgress?.(0.78);
      audit.setFluidParticlesVisible?.(true);
      audit.setQualityProfile?.('high');
    });

    await page.waitForTimeout(1200);
    await collectPhase(page, report.highPhase, 40, 120);

    await page.evaluate(() => {
      const audit = window.__ORB_AUDIT__;
      audit.setQualityProfile?.('safe');
    });

    await page.waitForTimeout(1200);
    await collectPhase(page, report.safePhase, 24, 120);

    const rebuildCounts = report.safePhase.map((x) => Number(x?.fluidMetrics?.rebuildCount ?? 0));
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

    report.status = downgradeRebuilds === 0 ? 'ok' : 'rebuild-regression';

    writeJson(jsonPath, report);
    writeText(
      txtPath,
      [
        `browser=${browserName}`,
        `status=${report.status}`,
        `highSamples=${report.summary.highSamples}`,
        `safeSamples=${report.summary.safeSamples}`,
        `downgradeRebuilds=${report.summary.downgradeRebuilds}`,
        `lastSafeQualityProfile=${report.summary.lastSafeQualityProfile}`,
      ].join('\n'),
    );
    writeText(logPath, browserLog.join('\n'));

    await browser.close();

    if (downgradeRebuilds !== 0) {
      throw new Error(`${browserName}: downgradeRebuilds=${downgradeRebuilds}`);
    }

    return { browserName, jsonPath, txtPath, logPath, status: report.status };
  } catch (err) {
    report.status = 'error';
    report.errors.push(String(err?.stack || err?.message || err));

    writeJson(jsonPath, report);
    writeText(
      txtPath,
      [
        `browser=${browserName}`,
        `status=${report.status}`,
        `error=${report.errors[0] ?? 'unknown'}`,
      ].join('\n'),
    );
    writeText(logPath, browserLog.join('\n'));

    if (browser) {
      try { await browser.close(); } catch {}
    }
    throw err;
  }
}

async function main() {
  writeText(path.join(auditDir, 'runner-phase.txt'), 'before-require-playwright');

  const { chromium, firefox } = require('playwright');

  writeText(path.join(auditDir, 'runner-phase.txt'), 'after-require-playwright');

  const results = [];
  results.push(await runBrowser('chromium', chromium));
  results.push(await runBrowser('firefox', firefox));

  const manifest = {
    startedAt: new Date().toISOString(),
    repo,
    auditDir,
    url,
    results,
  };

  writeJson(path.join(auditDir, 'playwright-flicker-manifest.json'), manifest);
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  writeText(
    path.join(auditDir, 'runner-fatal.log'),
    String(err?.stack || err?.message || err),
  );
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
