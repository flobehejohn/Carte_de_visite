export type OrbLogLevel = 'info' | 'warn' | 'error';

export type OrbStatusHandler = (message: string, level: OrbLogLevel) => void;

export type OrbLogContextLike = {
  statusHandler?: OrbStatusHandler;
};

export type OrbDebugEntry = {
  ts: number;
  level: OrbLogLevel;
  namespace: string;
  message: string;
  args: unknown[];
  audit: boolean;
  visible: boolean;
};

export type OrbLogOptions = {
  ctx?: OrbLogContextLike | null;
  key?: string;
  throttleMs?: number;
  once?: boolean;
  audit?: boolean;
  visible?: boolean;
  emitStatus?: boolean;
  maxBuffer?: number;
};

type StorageLike = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
};

type OrbGlobalRuntime = typeof globalThis & {
  __ORB_VERBOSE__?: boolean;
  __ORB_AUDIT_VERBOSE__?: boolean;
  __ORB_DEBUG_BUFFER__?: OrbDebugEntry[];
  __ORB_DEBUG_THROTTLE__?: Map<string, number>;
  __ORB_DEBUG_ONCE__?: Set<string>;
  localStorage?: StorageLike;
  sessionStorage?: StorageLike;
};

declare global {
  var __ORB_VERBOSE__: boolean | undefined;
  var __ORB_AUDIT_VERBOSE__: boolean | undefined;
  var __ORB_DEBUG_BUFFER__: OrbDebugEntry[] | undefined;
  var __ORB_DEBUG_THROTTLE__: Map<string, number> | undefined;
  var __ORB_DEBUG_ONCE__: Set<string> | undefined;
}

const DEFAULT_MAX_BUFFER = 300;

function getRuntime(): OrbGlobalRuntime {
  return globalThis as OrbGlobalRuntime;
}

function getLocalStorageSafe(): StorageLike | null {
  try {
    const runtime = getRuntime();
    return runtime.localStorage ?? null;
  } catch {
    return null;
  }
}

function getSessionStorageSafe(): StorageLike | null {
  try {
    const runtime = getRuntime();
    return runtime.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isTruthyFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

function readStorageFlag(key: string): boolean {
  try {
    const localStorage = getLocalStorageSafe();
    const value = localStorage?.getItem(key);
    if (isTruthyFlag(value)) return true;
  } catch {
    // noop
  }

  try {
    const sessionStorage = getSessionStorageSafe();
    const value = sessionStorage?.getItem(key);
    if (isTruthyFlag(value)) return true;
  } catch {
    // noop
  }

  return false;
}

function getNow(): number {
  try {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.now === 'function'
    ) {
      return performance.now();
    }
  } catch {
    // noop
  }

  return Date.now();
}

function getBufferStore(): OrbDebugEntry[] {
  if (!globalThis.__ORB_DEBUG_BUFFER__) {
    globalThis.__ORB_DEBUG_BUFFER__ = [];
  }
  return globalThis.__ORB_DEBUG_BUFFER__;
}

function getThrottleStore(): Map<string, number> {
  if (!globalThis.__ORB_DEBUG_THROTTLE__) {
    globalThis.__ORB_DEBUG_THROTTLE__ = new Map<string, number>();
  }
  return globalThis.__ORB_DEBUG_THROTTLE__;
}

function getOnceStore(): Set<string> {
  if (!globalThis.__ORB_DEBUG_ONCE__) {
    globalThis.__ORB_DEBUG_ONCE__ = new Set<string>();
  }
  return globalThis.__ORB_DEBUG_ONCE__;
}

export function isOrbVerbose(): boolean {
  if (globalThis.__ORB_VERBOSE__ === true) return true;
  if (readStorageFlag('ORB_VERBOSE')) return true;
  return false;
}

export function isOrbAuditVerbose(): boolean {
  if (globalThis.__ORB_AUDIT_VERBOSE__ === true) return true;
  if (readStorageFlag('ORB_AUDIT_VERBOSE')) return true;
  return false;
}

function formatMessage(namespace: string, message: string): string {
  return `[${namespace}] ${message}`;
}

function shouldPrintInfo(options?: OrbLogOptions): boolean {
  if (options?.visible === true) return true;
  if (options?.audit === true) return isOrbAuditVerbose();
  return isOrbVerbose();
}

function shouldPrint(level: OrbLogLevel, options?: OrbLogOptions): boolean {
  if (level === 'warn' || level === 'error') return true;
  return shouldPrintInfo(options);
}

function shouldEmitByFrequency(
  level: OrbLogLevel,
  namespace: string,
  message: string,
  options?: OrbLogOptions,
): boolean {
  const key = options?.key ?? `${level}:${namespace}:${message}`;
  const once = options?.once === true;
  const throttleMs = Math.max(0, Number(options?.throttleMs ?? 0));

  if (once) {
    const onceStore = getOnceStore();
    if (onceStore.has(key)) return false;
    onceStore.add(key);
  }

  if (throttleMs > 0) {
    const now = getNow();
    const throttleStore = getThrottleStore();
    const last = throttleStore.get(key);

    if (typeof last === 'number' && now - last < throttleMs) {
      return false;
    }

    throttleStore.set(key, now);
  }

  return true;
}

function pushBuffer(
  entry: OrbDebugEntry,
  maxBuffer = DEFAULT_MAX_BUFFER,
): void {
  const buffer = getBufferStore();
  buffer.push(entry);

  const max = Math.max(10, Number(maxBuffer) || DEFAULT_MAX_BUFFER);
  if (buffer.length > max) {
    buffer.splice(0, buffer.length - max);
  }
}

function emitStatus(
  ctx: OrbLogContextLike | null | undefined,
  message: string,
  level: OrbLogLevel,
  emit = true,
): void {
  if (!emit) return;

  const handler = ctx?.statusHandler;
  if (typeof handler !== 'function') return;

  try {
    handler(message, level);
  } catch {
    // Un logger ne doit jamais casser le runtime.
  }
}

function writeConsole(
  level: OrbLogLevel,
  namespace: string,
  message: string,
  args: unknown[],
): void {
  const line = formatMessage(namespace, message);

  if (level === 'error') {
    console.error(line, ...args);
    return;
  }

  if (level === 'warn') {
    console.warn(line, ...args);
    return;
  }

  console.info(line, ...args);
}

function emit(
  level: OrbLogLevel,
  namespace: string,
  message: string,
  options?: OrbLogOptions,
  ...args: unknown[]
): void {
  if (!shouldEmitByFrequency(level, namespace, message, options)) {
    return;
  }

  const visible = shouldPrint(level, options);

  pushBuffer(
    {
      ts: getNow(),
      level,
      namespace,
      message,
      args,
      audit: options?.audit === true,
      visible,
    },
    options?.maxBuffer,
  );

  emitStatus(options?.ctx, message, level, options?.emitStatus !== false);

  if (visible) {
    writeConsole(level, namespace, message, args);
  }
}

export function orbLog(
  namespace: string,
  message: string,
  options?: OrbLogOptions,
  ...args: unknown[]
): void {
  emit('info', namespace, message, options, ...args);
}

export function orbWarn(
  namespace: string,
  message: string,
  options?: OrbLogOptions,
  ...args: unknown[]
): void {
  emit('warn', namespace, message, options, ...args);
}

export function orbError(
  namespace: string,
  message: string,
  options?: OrbLogOptions,
  ...args: unknown[]
): void {
  emit('error', namespace, message, options, ...args);
}

export function __resetOrbDebugForTests(): void {
  globalThis.__ORB_DEBUG_BUFFER__ = [];
  globalThis.__ORB_DEBUG_THROTTLE__ = new Map<string, number>();
  globalThis.__ORB_DEBUG_ONCE__ = new Set<string>();
  delete globalThis.__ORB_VERBOSE__;
  delete globalThis.__ORB_AUDIT_VERBOSE__;

  try {
    getLocalStorageSafe()?.removeItem('ORB_VERBOSE');
    getLocalStorageSafe()?.removeItem('ORB_AUDIT_VERBOSE');
  } catch {
    // noop
  }

  try {
    getSessionStorageSafe()?.removeItem('ORB_VERBOSE');
    getSessionStorageSafe()?.removeItem('ORB_AUDIT_VERBOSE');
  } catch {
    // noop
  }
}
