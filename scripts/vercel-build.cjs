const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const nodeBin = process.execPath;

function resolveBin(pkgPath) {
  try {
    return require.resolve(pkgPath, { paths: [repoRoot] });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    process.stderr.write(`[vercel-build] resolve failed: ${pkgPath} (${msg})\n`);
    process.exit(1);
  }
}

function resolveBinFromPackage(pkgName, relBinPath) {
  const pkgJson = resolveBin(`${pkgName}/package.json`);
  return path.join(path.dirname(pkgJson), relBinPath);
}

function runStep(step, args) {
  const start = Date.now();
  process.stdout.write(`[vercel-build] start step=${step}\n`);
  const r = spawnSync(nodeBin, args, { cwd: repoRoot, stdio: 'inherit' });
  const ms = Date.now() - start;
  const exitCode = typeof r.status === 'number' ? r.status : 1;
  process.stdout.write(
    `[vercel-build] done step=${step} exit=${exitCode} ms=${ms}\n`,
  );
  if (exitCode !== 0) process.exit(exitCode);
}

const tscBin = resolveBinFromPackage('typescript', 'bin/tsc');
const viteBin = resolveBinFromPackage('vite', 'bin/vite.js');

runStep('typecheck:client', [
  tscBin,
  '-p',
  'tsconfig.client.json',
  '--noEmit',
  '--pretty',
  'false',
]);

runStep('typecheck:server', [
  tscBin,
  '-p',
  'tsconfig.server.json',
  '--noEmit',
  '--pretty',
  'false',
]);

runStep('vite:build', [viteBin, 'build']);
