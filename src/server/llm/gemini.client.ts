// src/server/llm/gemini.client.ts
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import {
  GuardianJsonSchema,
  OracleJsonSchema,
} from '../contracts/oracle.schemas.js';
import type { Citation } from '../contracts/oracle.types.js';

/** ===========================
 *  Gemini RAW client
 *  =========================== */

export type GeminiCallArgs = {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  timeoutMs: number;
  traceId: string;
};

export type GeminiCallResult = {
  ok: boolean;
  status: number;
  text: string;
  raw?: unknown;
  ms: number;
};

function withTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(
        () => rej(new Error('GEMINI_TIMEOUT')),
        Math.max(1, timeoutMs),
      ),
    ),
  ]);
}

function extractStatus(err: any): number {
  return (
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    (typeof err?.code === 'number' ? err.code : undefined) ??
    500
  );
}

function extractMessage(err: any): string {
  const m =
    err?.message ??
    err?.response?.data?.error?.message ??
    err?.response?.statusText ??
    String(err);
  return String(m);
}

async function readRespText(resp: any): Promise<string> {
  if (typeof resp?.text === 'string') return resp.text;

  if (typeof resp?.text === 'function') {
    const v = resp.text();
    return typeof v === 'string' ? v : String(await v);
  }

  const parts =
    resp?.candidates?.[0]?.content?.parts ??
    resp?.response?.candidates?.[0]?.content?.parts ??
    [];

  if (Array.isArray(parts)) {
    return parts.map((p: any) => p?.text ?? '').join('');
  }
  return String(resp ?? '');
}

export async function callGemini(
  args: GeminiCallArgs,
): Promise<GeminiCallResult> {
  const t0 = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: args.key });

    const resp = await withTimeout(
      ai.models.generateContent({
        model: args.model,
        contents: args.prompt,
        config: {
          temperature: args.temperature,
          topP: args.topP,
          maxOutputTokens: Math.max(64, args.maxOutputTokens),
        },
      }),
      args.timeoutMs,
    );

    const text = await readRespText(resp);

    return {
      ok: true,
      status: 200,
      text: String(text ?? ''),
      raw: {
        traceId: args.traceId,
        structured: false,
        model: args.model,
      },
      ms: Math.max(0, Date.now() - t0),
    };
  } catch (err: any) {
    const status = extractStatus(err);
    const msg = extractMessage(err);
    return {
      ok: false,
      status: typeof status === 'number' ? status : 500,
      text: msg,
      raw: {
        traceId: args.traceId,
        structured: false,
        error: msg,
      },
      ms: Math.max(0, Date.now() - t0),
    };
  }
}

/** ===========================
 *  Parse utils
 *  =========================== */

function isJsonRepairAllowed(): boolean {
  const v = String(process.env.GEMINI_ALLOW_JSON_REPAIR ?? '').trim();
  if (v === '1') return true;
  if (v === '0') return false;
  return false; // défaut strict
}

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

// répare \n/\r/\t/\u2028/\u2029 à l’intérieur des strings JSON
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

  // 1) direct
  try {
    return { ok: true, value: JSON.parse(candidate0) };
  } catch {}

  // 2) { ... } extraction
  const obj = candidate0.match(/\{[\s\S]*\}/);
  const candidate1 = obj?.[0] ? obj[0] : tryExtractBracedObject(candidate0);

  try {
    return { ok: true, value: JSON.parse(candidate1) };
  } catch (e1: any) {
    if (!isJsonRepairAllowed()) {
      return {
        ok: false,
        error: String(e1?.message ?? 'JSON.parse failed (repair disabled)'),
      };
    }
  }

  // 3) repair (si autorisé)
  const candidate2 = removeTrailingCommas(
    escapeBadCharsInsideStrings(candidate1),
  );
  try {
    return { ok: true, value: JSON.parse(candidate2) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'JSON.parse failed') };
  }
}

// Schéma tolérant (IDs-only) pour éviter fallback quand on a citation_ids
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

  const validated = OracleJsonSchema.safeParse(parsed.value);
  if (validated.success) return { json: validated.data, jsonError: null };

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

  const validated = GuardianJsonSchema.safeParse(parsed.value);
  if (validated.success) return { json: validated.data, jsonError: null };

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

  const min = isGuardian ? 0 : 2;
  if (ids.length < min && citations.length) {
    for (const c of citations) {
      const id = String(c.id);
      if (!ids.includes(id)) ids.push(id);
      if (ids.length >= min) break;
    }
  }

  const picked = ids
    .map((id) => byId.get(String(id)))
    .filter(Boolean)
    .map((c) => ({ ...c }));

  const finalCitations =
    picked.length > 0 ? picked : citations.map((c) => ({ ...c }));

  const finalIds =
    ids.length > 0 ? ids : finalCitations.map((c) => String(c.id));

  return { ...json, citation_ids: finalIds, citations: finalCitations };
}
