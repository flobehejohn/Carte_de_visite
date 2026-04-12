import type { Citation } from '../contracts/oracle.types.js';
import { GuardianJsonSchema, OracleJsonSchema } from '../contracts/oracle.schemas.js';

export function stripCodeFences(s: string): string {
  const t = String(s ?? '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) return m[1].trim();
  return t;
}

export function tryParseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const candidate = stripCodeFences(text);

  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {}

  const obj = candidate.match(/\{[\s\S]*\}/);
  if (obj?.[0]) {
    try {
      return { ok: true, value: JSON.parse(obj[0]) };
    } catch {}
  }

  const arr = candidate.match(/\[[\s\S]*\]/);
  if (arr?.[0]) {
    try {
      return { ok: true, value: JSON.parse(arr[0]) };
    } catch {}
  }

  return { ok: false, error: 'JSON.parse failed (no valid JSON detected)' };
}

export function parseOracleJson(text: string): {
  json: any | null;
  jsonError: string | null;
} {
  const parsed = tryParseJson(text);
  if (!parsed.ok) return { json: null, jsonError: parsed.error };

  const validated = OracleJsonSchema.safeParse(parsed.value);
  if (!validated.success) return { json: null, jsonError: 'INVALID_JSON_SCHEMA' };

  return { json: validated.data, jsonError: null };
}

export function parseGuardianJson(text: string): {
  json: any | null;
  jsonError: string | null;
} {
  const parsed = tryParseJson(text);
  if (!parsed.ok) return { json: null, jsonError: parsed.error };

  const validated = GuardianJsonSchema.safeParse(parsed.value);
  if (!validated.success) return { json: null, jsonError: 'INVALID_JSON_SCHEMA' };

  return { json: validated.data, jsonError: null };
}

function clampNumber(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeOrbDelta(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = clampNumber(v, -1, 1);
    }
  }
  return out;
}

export function applyCitationsToJson(json: any, citations: Citation[]): any {
  if (!json || typeof json !== 'object') return json;
  return { ...json, citations: citations.map((c) => ({ ...c })) };
}
