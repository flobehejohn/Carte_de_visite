'use strict';

const { spawnSync } = require('child_process');

function fail(msg) {
  process.stderr.write(String(msg || 'selftest failed') + '\n');
  process.exit(1);
}

if (process.env.CODEX_SPAWN_ENVFIX !== '1') {
  fail('CODEX_SPAWN_ENVFIX must be 1');
}

const brokenEnv = {
  PATH: 'C:\\Somewhere',
  Path: 'C:\\Windows\\System32;C:\\Other',
  windir: 'C:\\Windows',
  SystemRoot: 'C:\\Windows'
};

const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'echo SELFTEST_OK'], {
  env: brokenEnv,
  encoding: 'utf8'
});

if (result.error) {
  fail('spawn error: ' + String(result.error.message || result.error));
}

const code = typeof result.status === 'number' ? result.status : 1;
const out = String(result.stdout || '') + String(result.stderr || '');

if (code !== 0) {
  fail('exit code ' + String(code));
}

if (!out.includes('SELFTEST_OK')) {
  fail('missing SELFTEST_OK');
}

process.stdout.write('SELFTEST_OK\n');
process.exit(0);
