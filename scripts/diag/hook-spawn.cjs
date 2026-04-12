'use strict';

const fs = require('fs');
const path = require('path');
const child = require('child_process');

const LOG_PATH = process.env.CODEX_SPAWN_TRACE_LOG || '';

function ensureDir(p) {
  try {
    if (!p) return;
    fs.mkdirSync(path.dirname(p), { recursive: true });
  } catch (_) { /* noop */ }
}

function nowIso() {
  return new Date().toISOString();
}

function isSecretLike(s) {
  if (!s) return false;
  const v = String(s);
  if (v.length >= 32 && /^[A-Za-z0-9_-]+$/.test(v)) return true;
  if (/^AIza[0-9A-Za-z_-]+/.test(v)) return true;
  if (/(key|token|secret|password|authorization|bearer|api[_-]?key|apikey)/i.test(v)) return true;
  return false;
}

function sanitizeArg(arg) {
  const v = String(arg);
  if (isSecretLike(v)) return `REDACTED(len=${v.length})`;
  if (v.length > 200) return `${v.slice(0, 200)}...(trunc len=${v.length})`;
  return v;
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Buffer);
}

function pickSystemRoot(env) {
  return env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR || 'C:\\Windows';
}

function ensurePathHasSystem32(p, system32) {
  const low = (p || '').toLowerCase();
  if (low.includes('\\system32')) return p;
  if (!p) return system32;
  return system32 + ';' + p;
}

function applyEnvFixToArgs(callArgs) {
  const args = Array.prototype.slice.call(callArgs);
  if (process.env.CODEX_SPAWN_ENVFIX !== '1') {
    return { callArgs: args, envfixApplied: false };
  }
  let optionsIndex = -1;
  let cbIndex = -1;

  for (let i = 1; i < args.length; i += 1) {
    const v = args[i];
    if (cbIndex === -1 && typeof v === 'function') cbIndex = i;
    if (optionsIndex === -1 && isPlainObject(v)) optionsIndex = i;
  }

  if (optionsIndex === -1) {
    const opt = { env: { ...process.env } };
    if (cbIndex >= 0) {
      args.splice(cbIndex, 0, opt);
      optionsIndex = cbIndex;
    } else {
      args.push(opt);
      optionsIndex = args.length - 1;
    }
  }

  const options = args[optionsIndex] || {};
  if (!options.env) {
    options.env = { ...process.env };
  }

  const env = options.env;
  const systemRoot = pickSystemRoot(env);
  const system32 = path.win32.join(systemRoot, 'System32');

  if (!env.SystemRoot) env.SystemRoot = systemRoot;
  if (!env.windir) env.windir = systemRoot;

  let pathVal = env.PATH || env.Path || '';
  const pathAlt = env.Path || env.PATH || '';
  if (!pathVal && pathAlt) pathVal = pathAlt;
  if (pathVal && pathAlt && pathVal !== pathAlt) {
    const hasA = pathVal.toLowerCase().includes('\\system32');
    const hasB = pathAlt.toLowerCase().includes('\\system32');
    if (hasB && !hasA) pathVal = pathAlt;
  }
  pathVal = ensurePathHasSystem32(pathVal, system32);
  env.PATH = pathVal;
  env.Path = pathVal;

  const comspec = env.COMSPEC || env.ComSpec || path.win32.join(system32, 'cmd.exe');
  env.COMSPEC = comspec;
  env.ComSpec = comspec;

  const cmd = args[0];
  const base = path.win32.basename(String(cmd || '')).toLowerCase();
  if (base === 'cmd.exe' || base === 'cmd') {
    args[0] = comspec;
  }

  return { callArgs: args, envfixApplied: true };
}

function envMeta(env) {
  const e = env || process.env;
  const keys = ['Path', 'PATH', 'ComSpec', 'COMSPEC', 'SystemRoot', 'windir', 'PATHEXT'];
  const meta = {};
  keys.forEach((k) => {
    const v = e[k];
    const present = typeof v === 'string';
    const len = present ? v.length : 0;
    meta[k] = { present, length: len };
    if (k === 'Path' || k === 'PATH') {
      const low = (v || '').toLowerCase();
      meta[k].has_system32 = low.includes('\\system32');
      meta[k].has_windows_system32 = low.includes('\\windows\\system32');
    }
  });
  return meta;
}

function getStack() {
  const err = new Error('spawn_trace');
  if (!err.stack) return '';
  const lines = err.stack.split('\n');
  return lines.slice(2, 12).join('\n');
}

function logRecord(rec) {
  if (!LOG_PATH) return;
  try {
    ensureDir(LOG_PATH);
    fs.appendFileSync(LOG_PATH, JSON.stringify(rec) + '\n', 'utf8');
  } catch (_) { /* noop */ }
}

function buildRecord(method, cmd, args, options, envfixApplied) {
  const safeArgs = Array.isArray(args) ? args.map(sanitizeArg) : [];
  const shell = options && Object.prototype.hasOwnProperty.call(options, 'shell') ? options.shell : undefined;
  const cwd = options && options.cwd ? String(options.cwd) : process.cwd();
  const env = options && options.env ? options.env : process.env;

  return {
    ts: nowIso(),
    method,
    command: sanitizeArg(cmd),
    args: safeArgs,
    cwd,
    shell,
    env_meta: envMeta(env),
    envfix_applied: !!envfixApplied,
    stack: getStack()
  };
}

function wrapSpawn(fnName, fn) {
  return function wrapped() {
    const prep = applyEnvFixToArgs(arguments);
    const callArgs = prep.callArgs;
    const cmd = callArgs[0];
    const args = Array.isArray(callArgs[1]) ? callArgs[1] : [];
    const options = callArgs.find((v, idx) => idx > 0 && isPlainObject(v));
    const rec = buildRecord(fnName, cmd, args, options, prep.envfixApplied);
    let childProc;
    try {
      childProc = fn.apply(child, callArgs);
    } catch (err) {
      rec.error = { message: String(err && err.message || err), code: err && err.code ? String(err.code) : '' };
      logRecord(rec);
      throw err;
    }
    if (childProc && typeof childProc.on === 'function') {
      childProc.on('error', (err) => {
        logRecord({
          ts: nowIso(),
          method: `${fnName}.error`,
          command: sanitizeArg(cmd),
          args: Array.isArray(args) ? args.map(sanitizeArg) : [],
          cwd: options && options.cwd ? String(options.cwd) : process.cwd(),
          shell: options && Object.prototype.hasOwnProperty.call(options, 'shell') ? options.shell : undefined,
          env_meta: envMeta(options && options.env ? options.env : process.env),
          envfix_applied: !!prep.envfixApplied,
          error: { message: String(err && err.message || err), code: err && err.code ? String(err.code) : '' }
        });
      });
    }
    logRecord(rec);
    return childProc;
  };
}

function wrapSpawnSync(fnName, fn) {
  return function wrapped() {
    const prep = applyEnvFixToArgs(arguments);
    const callArgs = prep.callArgs;
    const cmd = callArgs[0];
    const args = Array.isArray(callArgs[1]) ? callArgs[1] : [];
    const options = callArgs.find((v, idx) => idx > 0 && isPlainObject(v));
    const rec = buildRecord(fnName, cmd, args, options, prep.envfixApplied);
    let result;
    try {
      result = fn.apply(child, callArgs);
      if (result && result.error) {
        rec.error = { message: String(result.error.message || result.error), code: result.error.code ? String(result.error.code) : '' };
      }
    } catch (err) {
      rec.error = { message: String(err && err.message || err), code: err && err.code ? String(err.code) : '' };
      logRecord(rec);
      throw err;
    }
    logRecord(rec);
    return result;
  };
}

child.spawn = wrapSpawn('spawn', child.spawn);
child.spawnSync = wrapSpawnSync('spawnSync', child.spawnSync);
child.execFile = wrapSpawn('execFile', child.execFile);
child.execFileSync = wrapSpawnSync('execFileSync', child.execFileSync);

logRecord({ ts: nowIso(), method: 'hook', message: 'spawn hooks installed', envfix_applied: false });
