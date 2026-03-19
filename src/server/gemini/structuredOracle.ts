// src/server/gemini/structuredOracle.ts
import { GoogleGenAI, Schema, Type } from '@google/genai';
import { z } from 'zod';
import type { JsonErrorCode, RawContractMeta } from './contract-types.js';
import { normalizeOracleAnchorRole } from './oracle-hermeneutic.js';
import {
  GuardianStructuredSchema,
  OracleStructuredSchema,
} from '../../shared/contracts/gemini.contracts.js';

export type GeminiMode = 'raw' | 'oracle' | 'guardian';

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
  jsonCandidate?: unknown | null;
  raw: RawContractMeta & {
    traceId: string;
    model: string;
    repairAllowed?: boolean;
    issues?: unknown;
    preview?: string | null;
    parsedPreview?: string | null;
    error?: string | null;
  };
  ms: number;
};

export function pickZodSchema(mode: GeminiMode): z.ZodTypeAny | null {
  if (mode === 'oracle') return OracleStructuredSchema;
  if (mode === 'guardian') return GuardianStructuredSchema;
  return null;
}

const NATIVE_ORACLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    quote: { type: Type.STRING } as any,
    opening_image: { type: Type.STRING } as any,
    central_tension: { type: Type.STRING } as any,
    reversal: { type: Type.STRING } as any,
    imperative: { type: Type.STRING } as any,
    return_axis: { type: Type.STRING } as any,
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING } as any,
      minItems: 4,
      maxItems: 10,
    } as any,
    anchors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          citation_id: { type: Type.STRING } as any,
          role: {
            type: Type.STRING,
            format: 'enum',
            enum: ['anchor', 'tension', 'turn'],
            description:
              'Canonical oracle anchor role. Use only anchor, tension, or turn.',
          } as any,
          motif: { type: Type.STRING } as any,
          claim: { type: Type.STRING } as any,
        },
        required: ['citation_id', 'role', 'motif', 'claim'],
      } as any,
      minItems: 2,
      maxItems: 4,
    } as any,
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
    'opening_image',
    'central_tension',
    'reversal',
    'imperative',
    'return_axis',
    'keywords',
    'anchors',
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
  const raw =
    process.env.GEMINI_ALLOW_JSON_REPAIR ??
    process.env.GEMINI_JSON_REPAIR ??
    '';
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function pickThinkingConfig(model: string):
  | { thinkingBudget: number; includeThoughts: boolean }
  | undefined {
  const normalized = String(model ?? '').trim().toLowerCase();
  if (!normalized.includes('gemini-2.5')) return undefined;
  return {
    // Structured JSON is more reliable when hidden reasoning does not consume
    // the output budget.
    thinkingBudget: 0,
    includeThoughts: false,
  };
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

function stripJsonFences(s: string): string {
  const t = String(s ?? '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) return m[1].trim();
  return t
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function extractJsonCandidate(s: string): string | null {
  const t = String(s ?? '').trim();
  const iObj = t.indexOf('{');
  const iArr = t.indexOf('[');
  const starts = [iObj, iArr].filter((x) => x >= 0);
  if (!starts.length) return null;

  const start = Math.min(...starts);
  const open = t[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < t.length; i++) {
    const ch = t[i];

    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = false;
        continue;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      continue;
    }

    if (ch === open) depth++;
    if (ch === close) depth--;

    if (depth === 0) return t.slice(start, i + 1);
  }

  return t.slice(start);
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

type ParseOk = {
  ok: true;
  value: any;
  repaired: boolean;
  stage: string;
  candidate: string;
  rawJsonError: JsonErrorCode;
};

type ParseKo = { ok: false; err: string; stage: string; candidate?: string };

function parseJsonCandidate(text: string): ParseOk | ParseKo {
  const raw0 = String(text ?? '').trim();
  if (!raw0) return { ok: false, err: 'EMPTY_TEXT', stage: 'empty' };

  const unfenced = stripJsonFences(raw0);
  const candidate = extractJsonCandidate(unfenced) ?? unfenced;

  try {
    return {
      ok: true,
      value: JSON.parse(candidate),
      repaired: false,
      stage: 'direct',
      candidate,
      rawJsonError: null,
    };
  } catch (e1: any) {
    if (!isJsonRepairAllowed()) {
      return {
        ok: false,
        err: `JSON.parse failed (repair disabled): ${String(
          e1?.message ?? e1,
        )}`,
        stage: 'strict_fail',
        candidate,
      };
    }
  }

  const repairedText = removeTrailingCommas(
    escapeBadCharsInsideStrings(candidate),
  );

  try {
    return {
      ok: true,
      value: JSON.parse(repairedText),
      repaired: true,
      stage: 'repaired',
      candidate: repairedText,
      rawJsonError: 'INVALID_JSON_FROM_LLM',
    };
  } catch (e2: any) {
    return {
      ok: false,
      err: `JSON.parse failed after repair: ${String(e2?.message ?? e2)}`,
      stage: 'repaired_fail',
      candidate,
    };
  }
}

function strictNormalizeOracle(input: any): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const o: any = { ...input };

  for (const field of [
    'quote',
    'opening_image',
    'central_tension',
    'reversal',
    'imperative',
    'return_axis',
  ]) {
    if (Object.prototype.hasOwnProperty.call(o, field)) {
      o[field] = String(o[field] ?? '');
    }
  }
  if (Array.isArray(o.keywords)) {
    o.keywords = o.keywords
      .map((x: any) => String(x ?? ''))
      .filter(Boolean)
      .slice(0, 10);
  }
  if (Array.isArray(o.anchors)) {
    o.anchors = o.anchors.slice(0, 4).map((anchor: any) => ({
      citation_id: String(anchor?.citation_id ?? ''),
      role:
        normalizeOracleAnchorRole(anchor?.role) ??
        String(anchor?.role ?? '').trim(),
      motif: String(anchor?.motif ?? ''),
      claim: String(anchor?.claim ?? ''),
    }));
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

function buildRawMeta(args: {
  traceId: string;
  model: string;
  structured: boolean;
  fallback?: boolean;
  repairApplied?: boolean;
  reason?: string | null;
  parseError?: string | null;
  rawJsonError?: JsonErrorCode;
  retryCount?: number;
  parseStage?: string | null;
  preview?: string | null;
  parsedPreview?: string | null;
  repairAllowed?: boolean;
  issues?: unknown;
  error?: string | null;
}): GeminiCallResult['raw'] {
  return {
    traceId: args.traceId,
    model: args.model,
    structured: args.structured,
    fallback: args.fallback === true,
    repairApplied: args.repairApplied === true,
    reason: args.reason ?? null,
    parseError: args.parseError ?? null,
    rawJsonError: args.rawJsonError ?? null,
    retryCount: Math.max(0, Math.floor(args.retryCount ?? 0)),
    parseStage: args.parseStage ?? null,
    preview: args.preview ?? null,
    parsedPreview: args.parsedPreview ?? null,
    repairAllowed: args.repairAllowed,
    issues: args.issues,
    error: args.error ?? null,
  };
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
      jsonCandidate: null,
      raw: buildRawMeta({
        traceId: args.traceId,
        model: args.model,
        structured: false,
        reason: 'NO_SCHEMA',
      }),
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
          thinkingConfig: pickThinkingConfig(args.model),
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
        jsonCandidate: null,
        raw: buildRawMeta({
          traceId: args.traceId,
          model: args.model,
          structured: false,
          reason: 'INVALID_JSON_FROM_LLM',
          parseError: parsed.err,
          rawJsonError: 'INVALID_JSON_FROM_LLM',
          parseStage: parsed.stage,
          preview: parsed.candidate ? parsed.candidate.slice(0, 650) : null,
          repairAllowed: isJsonRepairAllowed(),
        }),
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
        jsonCandidate: normalized,
        raw: buildRawMeta({
          traceId: args.traceId,
          model: args.model,
          structured: false,
          reason: 'SCHEMA_VALIDATION_FAILED',
          rawJsonError: 'SCHEMA_VALIDATION_FAILED',
          parseStage: parsed.stage,
          repairApplied: parsed.repaired,
          issues: validated.error.flatten(),
          parsedPreview: safePreview(normalized),
        }),
        ms: Math.max(0, Date.now() - t0),
      };
    }

    const directStructured = !parsed.repaired;
    return {
      ok: true,
      status: 200,
      text: JSON.stringify(validated.data),
      jsonCandidate: validated.data,
      raw: buildRawMeta({
        traceId: args.traceId,
        model: args.model,
        structured: directStructured,
        fallback: false,
        repairApplied: parsed.repaired,
        reason: parsed.repaired ? 'NATIVE_REPAIR_OK' : 'NATIVE_OK',
        rawJsonError: parsed.rawJsonError,
        parseStage: parsed.stage,
      }),
      ms: Math.max(0, Date.now() - t0),
    };
  } catch (err: any) {
    const status = extractStatus(err);
    const msg = extractMessage(err);
    return {
      ok: false,
      status: typeof status === 'number' ? status : 500,
      text: msg,
      jsonCandidate: null,
      raw: buildRawMeta({
        traceId: args.traceId,
        model: args.model,
        structured: false,
        reason: 'UPSTREAM_ERROR',
        error: msg,
      }),
      ms: Math.max(0, Date.now() - t0),
    };
  }
}
