// src/server/llm/parse.ts
import { z } from 'zod';
import {
  GuardianJsonSchema,
  OracleJsonSchema,
} from '../contracts/oracle.schemas.js';
import type { Citation } from '../contracts/oracle.types.js';

export function stripCodeFences(s: string): string {
  const t = String(s ?? '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) return m[1].trim();
  return t;
}

function tryExtractBracedObject(s: string): string {
  const i = s.indexOf('{');
  const j = s.lastIndexOf('}');
  if (i >= 0 && j > i) return s.slice(i, j + 1);
  return s;
}

function removeTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, '$1');
}

function escapeBadCharsInsideStrings(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (inStr) {
      if (esc) {
        out += ch;
        esc = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        esc = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inStr = false;
        continue;
      }
      if (ch === '\r' || ch === '\n' || ch === '\u2028' || ch === '\u2029') {
        out += '\\n';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }

    if (ch === '"') {
      out += ch;
      inStr = true;
      continue;
    }
    out += ch;
  }

  return out;
}

export function tryParseJson(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const candidate0 = stripCodeFences(text);

  try {
    return { ok: true, value: JSON.parse(candidate0) };
  } catch {}

  const obj = candidate0.match(/\{[\s\S]*\}/);
  const candidate1 = obj?.[0] ? obj[0] : tryExtractBracedObject(candidate0);

  try {
    return { ok: true, value: JSON.parse(candidate1) };
  } catch {}

  const candidate2 = removeTrailingCommas(
    escapeBadCharsInsideStrings(candidate1),
  );
  try {
    return { ok: true, value: JSON.parse(candidate2) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'JSON.parse failed') };
  }
}

const OracleLooseSchema = z
  .object({
    quote: z.string().optional(),
    interpretation: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    citation_ids: z.array(z.string()).optional(),
    citations: z.array(z.any()).optional(),
    delta: z.any().optional(),
    confidence: z.any().optional(),
    visual_prescription: z.any().optional(),
  })
  .passthrough();

const GuardianLooseSchema = z
  .object({
    comment: z.string().optional(),
    isSafe: z.any().optional(),
    confidence: z.any().optional(),
    citation_ids: z.array(z.string()).optional(),
    citations: z.array(z.any()).optional(),
  })
  .passthrough();

export function parseOracleJson(text: string): {
  json: any | null;
  jsonError: string | null;
} {
  const parsed = tryParseJson(text);
  if (!parsed.ok) return { json: null, jsonError: parsed.error };

  const strict = OracleJsonSchema.safeParse(parsed.value);
  if (strict.success) return { json: strict.data, jsonError: null };

  const loose = OracleLooseSchema.safeParse(parsed.value);
  if (loose.success) return { json: loose.data, jsonError: null };

  return { json: null, jsonError: 'INVALID_JSON_SCHEMA' };
}

export function parseGuardianJson(text: string): {
  json: any | null;
  jsonError: string | null;
} {
  const parsed = tryParseJson(text);
  if (!parsed.ok) return { json: null, jsonError: parsed.error };

  const strict = GuardianJsonSchema.safeParse(parsed.value);
  if (strict.success) return { json: strict.data, jsonError: null };

  const loose = GuardianLooseSchema.safeParse(parsed.value);
  if (loose.success) return { json: loose.data, jsonError: null };

  return { json: null, jsonError: 'INVALID_JSON_SCHEMA' };
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

function uniqStrings(xs: string[], max = 64): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const s = String(x ?? '').trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function applyCitationsToJson(json: any, citations: Citation[]): any {
  if (!json || typeof json !== 'object') return json;

  const isGuardian = Object.prototype.hasOwnProperty.call(json, 'isSafe');

  const byId = new Map<string, Citation>();
  for (const c of citations) byId.set(String(c.id), c);

  const idsFromJson = Array.isArray((json as any).citation_ids)
    ? uniqStrings(
        (json as any).citation_ids.map((x: any) => String(x)),
        64,
      )
    : [];

  const idsFromCitationsField = Array.isArray((json as any).citations)
    ? uniqStrings(
        (json as any).citations
          .map((x: any) => String(x?.id ?? ''))
          .filter(Boolean),
        64,
      )
    : [];

  let ids = idsFromJson.length ? idsFromJson : idsFromCitationsField;

  // Oracle: min 2 ; Guardian: 0
  const min = isGuardian ? 0 : 2;
  if (ids.length < min && citations.length) {
    for (const c of citations) {
      const id = String(c.id);
      if (!ids.includes(id)) ids.push(id);
      if (ids.length >= min) break;
    }
  }

  // Ordre déterministe: IDs choisis d'abord, puis le reste
  const selected: Citation[] = [];
  const selectedSet = new Set<string>();

  for (const id of ids) {
    const c = byId.get(String(id));
    if (!c) continue;
    selected.push({ ...c });
    selectedSet.add(String(c.id));
  }

  const rest = citations
    .filter((c) => !selectedSet.has(String(c.id)))
    .map((c) => ({ ...c }));

  const ordered = [...selected, ...rest];
  const finalIds = ids.length ? ids : ordered.map((c) => String(c.id));

  return { ...json, citation_ids: finalIds, citations: ordered };
}
