import net from 'node:net';

const BLOCKED_PREFIX = 'TEST_NETWORK_BLOCKED';

type NetTarget = {
  host?: string;
  port?: number;
  socketPath?: string;
};

type UnknownRecord = Record<string, unknown>;

const originalNetConnect = net.connect.bind(net);
const originalNetCreateConnection = net.createConnection.bind(net);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) {
    return true;
  }

  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');

  if (!normalized) {
    return true;
  }

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('127.') ||
    normalized.startsWith('::ffff:127.')
  ) {
    return true;
  }

  return false;
}

function failNetwork(entryPoint: string, target: NetTarget): never {
  const host = target.host ?? 'unknown-host';
  const port = target.port !== undefined ? String(target.port) : 'unknown-port';
  throw new Error(
    `${BLOCKED_PREFIX}: outbound network is disabled during tests (${entryPoint} -> ${host}:${port})`,
  );
}

function enforceLocalOnly(entryPoint: string, target: NetTarget): void {
  if (target.socketPath) {
    return;
  }
  if (!isLoopbackHost(target.host)) {
    failNetwork(entryPoint, target);
  }
}

function extractNetTarget(args: unknown[]): NetTarget {
  if (args.length === 0) {
    return {};
  }

  const first = args[0];

  if (typeof first === 'number') {
    return {
      port: first,
      host: toStringOrUndefined(args[1]),
    };
  }

  if (typeof first === 'string') {
    const numeric = Number(first);
    if (Number.isFinite(numeric)) {
      return {
        port: numeric,
        host: toStringOrUndefined(args[1]),
      };
    }

    return { socketPath: first };
  }

  if (isRecord(first)) {
    const socketPath = toStringOrUndefined(first.path);
    if (socketPath) {
      return { socketPath };
    }

    return {
      host: toStringOrUndefined(first.host) ?? toStringOrUndefined(first.hostname),
      port: toNumberOrUndefined(first.port),
    };
  }

  return {};
}

function extractUrlFromFetchInput(input: unknown): URL | null {
  if (typeof input === 'string') {
    try {
      return new URL(input, 'http://localhost');
    } catch {
      return null;
    }
  }

  if (input instanceof URL) {
    return input;
  }

  if (isRecord(input) && typeof input.url === 'string') {
    try {
      return new URL(input.url, 'http://localhost');
    } catch {
      return null;
    }
  }

  return null;
}

const wrappedConnect: typeof net.connect = ((...args: unknown[]) => {
  const target = extractNetTarget(args);
  enforceLocalOnly('net.connect', target);
  return (originalNetConnect as (...raw: unknown[]) => ReturnType<typeof net.connect>)(...args);
}) as typeof net.connect;

const wrappedCreateConnection: typeof net.createConnection = ((...args: unknown[]) => {
  const target = extractNetTarget(args);
  enforceLocalOnly('net.createConnection', target);
  return (originalNetCreateConnection as (...raw: unknown[]) => ReturnType<typeof net.createConnection>)(...args);
}) as typeof net.createConnection;

net.connect = wrappedConnect;
net.createConnection = wrappedCreateConnection;

if (typeof globalThis.fetch === 'function') {
  const originalFetch = globalThis.fetch.bind(globalThis);

  const wrappedFetch: typeof globalThis.fetch = ((...args: unknown[]) => {
    const targetUrl = extractUrlFromFetchInput(args[0]);
    if (
      targetUrl &&
      (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:') &&
      !isLoopbackHost(targetUrl.hostname)
    ) {
      failNetwork('fetch', {
        host: targetUrl.hostname,
        port: toNumberOrUndefined(targetUrl.port),
      });
    }

    return (originalFetch as (...raw: unknown[]) => ReturnType<typeof globalThis.fetch>)(...args);
  }) as typeof globalThis.fetch;

  globalThis.fetch = wrappedFetch;
}
