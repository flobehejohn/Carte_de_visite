// src/server/gemini/structuredOracle.ts
import { GoogleGenAI, Schema, Type } from '@google/genai';
import { z } from 'zod';
import {
    GuardianStructuredSchema,
    OracleStructuredSchema,
} from '../../shared/contracts/gemini.contracts.js';

type GeminiMode = 'raw' | 'oracle' | 'guardian';

export type StructuredCallArgs = {
  key: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxOutputTokens: number;
  timeoutMs: number;
  traceId: string;
  mode: GeminiMode;
};

export type GeminiCallResult = {
  ok: boolean;
  status: number;
  text: string;
  raw?: unknown;
  ms: number;
};

function pickZodSchema(mode: GeminiMode): z.ZodTypeAny | null {
  if (mode === 'oracle') return OracleStructuredSchema;
  if (mode === 'guardian') return GuardianStructuredSchema;
  return null;
}

const NATIVE_ORACLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    quote: { type: Type.STRING } as any,
    interpretation: { type: Type.STRING } as any,
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING } as any,
      minItems: 1,
      maxItems: 12,
    } as any,
    citation_ids: {
      type: Type.ARRAY,
      items: { type: Type.STRING } as any,
      minItems: 2,
      maxItems: 64,
    } as any,
    delta: { type: Type.OBJECT } as any,
    confidence: { type: Type.NUMBER } as any,
    visual_prescription: {
      type: Type.OBJECT,
      properties: {
        primary_color: { type: Type.STRING } as any,
        chaos: { type: Type.NUMBER } as any,
        fog_density: { type: Type.NUMBER } as any,
        shape_archetype: { type: Type.STRING } as any,
      },
      required: ['primary_color', 'chaos', 'fog_density', 'shape_archetype'],
    } as any,
  },
  required: [
    'quote',
    'interpretation',
    'keywords',
    'citation_ids',
    'confidence',
    'visual_prescription',
  ],
};

const NATIVE_GUARDIAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    comment: { type: Type.STRING } as any,
    isSafe: { type: Type.BOOLEAN } as any,
    confidence: { type: Type.NUMBER } as any,
    citation_ids: {
      type: Type.ARRAY,
      items: { type: Type.STRING } as any,
      minItems: 0,
      maxItems: 64,
    } as any,
  },
  required: ['comment', 'isSafe', 'confidence'],
};

function pickNativeSchema(mode: GeminiMode): Schema | null {
  if (mode === 'oracle') return NATIVE_ORACLE_SCHEMA;
  if (mode === 'guardian') return NATIVE_GUARDIAN_SCHEMA;
  return null;
}

function isJsonRepairAllowed(): boolean {
  const v = String(process.env.GEMINI_ALLOW_JSON_REPAIR ?? '').trim();
  if (v === '1') return true;
  if (v === '0') return false;
  return false; // défaut strict
}

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
    err?.code ??
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

// -------- JSON parse strict (fences + extraction + OPTIONAL repair) --------
function stripJsonFences(s: string): string {
  return s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
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

type ParseOk = { ok: true; value: any; repaired: boolean; stage: string };
type ParseKo = { ok: false; err: string; stage: string };

function parseJsonCandidate(text: string): ParseOk | ParseKo {
  const raw = String(text ?? '').trim();
  if (!raw) return { ok: false, err: 'EMPTY_TEXT', stage: 'empty' };

  // direct
  try {
    return {
      ok: true,
      value: JSON.parse(raw),
      repaired: false,
      stage: 'direct',
    };
  } catch {}

  const unfenced = stripJsonFences(raw);
  try {
    return {
      ok: true,
      value: JSON.parse(unfenced),
      repaired: false,
      stage: 'unfenced',
    };
  } catch {}

  const extracted = tryExtractBracedObject(unfenced);
  try {
    return {
      ok: true,
      value: JSON.parse(extracted),
      repaired: false,
      stage: 'extracted',
    };
  } catch {}

  if (!isJsonRepairAllowed()) {
    return {
      ok: false,
      err: 'JSON.parse failed (repair disabled)',
      stage: 'strict_fail',
    };
  }

  // repair (si autorisé)
  const repairedText = removeTrailingCommas(
    escapeBadCharsInsideStrings(extracted),
  );
  try {
    return {
      ok: true,
      value: JSON.parse(repairedText),
      repaired: true,
      stage: 'repaired',
    };
  } catch (e: any) {
    return {
      ok: false,
      err: String(e?.message ?? 'PARSE_FAILED'),
      stage: 'repaired_fail',
    };
  }
}

// Normalisation STRICT : on ne “fabrique” pas de champs manquants
function strictNormalizeOracle(input: any): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const o: any = { ...input };

  if (Object.prototype.hasOwnProperty.call(o, 'quote')) {
    o.quote = String(o.quote ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'interpretation')) {
    o.interpretation = String(o.interpretation ?? '');
  }
  if (Array.isArray(o.keywords)) {
    o.keywords = o.keywords
      .map((x: any) => String(x ?? ''))
      .filter(Boolean)
      .slice(0, 12);
  }
  if (Array.isArray(o.citation_ids)) {
    o.citation_ids = o.citation_ids
      .map((x: any) => String(x ?? ''))
      .filter(Boolean)
      .slice(0, 64);
  }
  if (Object.prototype.hasOwnProperty.call(o, 'confidence')) {
    const n =
      typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
    o.confidence = Number.isFinite(n) ? n : o.confidence;
  }
  return o;
}

function strictNormalizeGuardian(input: any): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const o: any = { ...input };

  if (Object.prototype.hasOwnProperty.call(o, 'comment')) {
    o.comment = String(o.comment ?? '');
  }
  if (Object.prototype.hasOwnProperty.call(o, 'isSafe')) {
    o.isSafe = typeof o.isSafe === 'boolean' ? o.isSafe : Boolean(o.isSafe);
  }
  if (Object.prototype.hasOwnProperty.call(o, 'confidence')) {
    const n =
      typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
    o.confidence = Number.isFinite(n) ? n : o.confidence;
  }
  if (Array.isArray(o.citation_ids)) {
    o.citation_ids = o.citation_ids
      .map((x: any) => String(x ?? ''))
      .filter(Boolean)
      .slice(0, 64);
  }
  return o;
}

function safePreview(obj: any, max = 650): string | null {
  try {
    const s = JSON.stringify(obj);
    if (!s) return null;
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return null;
  }
}

export async function callGeminiStructured(
  args: StructuredCallArgs,
): Promise<GeminiCallResult> {
  const t0 = Date.now();

  const zodSchema = pickZodSchema(args.mode);
  const nativeSchema = pickNativeSchema(args.mode);

  if (!zodSchema || !nativeSchema) {
    return {
      ok: false,
      status: 400,
      text: 'Structured outputs requested but no schema for this mode.',
      raw: {
        traceId: args.traceId,
        mode: args.mode,
        structured: true,
        reason: 'NO_SCHEMA',
      },
      ms: Math.max(0, Date.now() - t0),
    };
  }

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
          responseMimeType: 'application/json',
          responseJsonSchema: nativeSchema as any,
        },
      }),
      args.timeoutMs,
    );

    const text = await readRespText(resp);

    const parsed = parseJsonCandidate(text);

    if (!parsed.ok) {
      return {
        ok: false,
        status: 422,
        text,
        raw: {
          traceId: args.traceId,
          mode: args.mode,
          structured: true,
          reason: 'INVALID_JSON_FROM_LLM',
          parseError: parsed.err,
          parseStage: parsed.stage,
        },
        ms: Math.max(0, Date.now() - t0),
      };
    }

    const normalized =
      args.mode === 'oracle'
        ? strictNormalizeOracle(parsed.value)
        : args.mode === 'guardian'
          ? strictNormalizeGuardian(parsed.value)
          : parsed.value;

    const validated = zodSchema.safeParse(normalized);

    if (!validated.success) {
      return {
        ok: false,
        status: 422,
        text: JSON.stringify(normalized),
        raw: {
          traceId: args.traceId,
          mode: args.mode,
          structured: true,
          reason: 'SCHEMA_VALIDATION_FAILED',
          parseStage: parsed.stage,
          repaired: parsed.repaired,
          issues: validated.error.flatten(),
          parsedPreview: safePreview(normalized),
        },
        ms: Math.max(0, Date.now() - t0),
      };
    }

    return {
      ok: true,
      status: 200,
      text: JSON.stringify(validated.data),
      raw: {
        traceId: args.traceId,
        mode: args.mode,
        structured: true,
        repaired: parsed.repaired,
        parseStage: parsed.stage,
        fallback: false,
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
        mode: args.mode,
        structured: true,
        reason: 'UPSTREAM_ERROR',
        error: msg,
      },
      ms: Math.max(0, Date.now() - t0),
    };
  }
}
