export type LogLevel = 'INFO' | 'WARN' | 'ERR' | 'DBG';

export function makeTraceId(prefix = 'srv'): string {
  const g = globalThis as any;
  const uuid = g?.crypto?.randomUUID?.();
  if (typeof uuid === 'string' && uuid.length > 0) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function safeLog(
  level: LogLevel,
  traceId: string,
  msg: string,
  fields: Record<string, unknown> = {},
): void {
  const kv = Object.entries(fields)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(' ');
  const line = `[api/gemini] level=${level} traceId=${traceId} ${msg}${kv ? ' ' + kv : ''}`;
  // eslint-disable-next-line no-console
  console.log(line);
}

export function clampNumber(
  n: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, v));
}
