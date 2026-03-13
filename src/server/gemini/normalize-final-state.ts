import { z } from 'zod';
import type {
  GeminiMode,
  JsonErrorCode,
  NormalizedContractState,
  RawContractMeta,
} from './contract-types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  return s.length > 0 ? s : null;
}

function toRetryCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function toJsonErrorCode(value: unknown): JsonErrorCode | null {
  const s = toNullableString(value);
  return s ? (s as JsonErrorCode) : null;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalizeConfidenceField<T>(input: T): T {
  if (!isRecord(input)) return input;

  if (!Object.prototype.hasOwnProperty.call(input, 'confidence')) {
    return input;
  }

  const current = input['confidence'];
  const numeric =
    typeof current === 'number' ? current : Number(current ?? Number.NaN);

  if (!Number.isFinite(numeric)) {
    return input;
  }

  return {
    ...input,
    confidence: clamp01(numeric),
  } as T;
}

export function normalizeRawContractMeta(raw: unknown): RawContractMeta {
  const source = isRecord(raw) ? raw : {};

  const normalized: RawContractMeta = {
    structured: source.structured === true,
    fallback: source.fallback === true,
    repairApplied: source.repairApplied === true,
    reason: toNullableString(source.reason),
    parseError: toNullableString(source.parseError),
    rawJsonError: toJsonErrorCode(source.rawJsonError),
    retryCount: toRetryCount(source.retryCount),
  };

  if (typeof source.parseStage === 'string') {
    (normalized as any).parseStage = source.parseStage;
  }

  if (typeof source.preview === 'string') {
    (normalized as any).preview = source.preview;
  }

  if (typeof source.parsedPreview === 'string') {
    (normalized as any).parsedPreview = source.parsedPreview;
  }

  if (typeof source.error === 'string') {
    (normalized as any).error = source.error;
  }

  if (source.repairAllowed !== undefined) {
    (normalized as any).repairAllowed = source.repairAllowed;
  }

  if (source.issues !== undefined) {
    (normalized as any).issues = source.issues;
  }

  return normalized;
}

function computeFinalJsonError(
  schemaValid: boolean,
  raw: RawContractMeta,
): JsonErrorCode | null {
  if (schemaValid) return null;
  return raw.rawJsonError ?? ('SCHEMA_VALIDATION_FAILED' as JsonErrorCode);
}

export function normalizeFinalState(args: {
  mode: GeminiMode;
  schema: z.ZodTypeAny;
  finalJsonCandidate: unknown;
  raw?: unknown;
  citationsUsed?: NormalizedContractState['citationsUsed'];
  knowledge?: NormalizedContractState['knowledge'];
}): NormalizedContractState {
  const raw = normalizeRawContractMeta(args.raw);
  const candidate = normalizeConfidenceField(args.finalJsonCandidate);
  const parsed = args.schema.safeParse(candidate);

  const citationsUsed = args.citationsUsed ?? [];

  if (parsed.success) {
    const finalJson = normalizeConfidenceField(parsed.data);

    return {
      mode: args.mode,
      finalJson,
      finalJsonError: null,
      schemaValid: true,
      structuredUsed: true,
      raw,
      citationsUsed,
      knowledge: args.knowledge,
    };
  }

  return {
    mode: args.mode,
    finalJson: null,
    finalJsonError: computeFinalJsonError(false, raw),
    schemaValid: false,
    structuredUsed: false,
    raw,
    citationsUsed,
    knowledge: args.knowledge,
  };
}
