import { z } from 'zod';

const JsonErrorCodeSchema = z
  .enum(['INVALID_JSON_FROM_LLM', 'SCHEMA_VALIDATION_FAILED'])
  .nullable();

const StrictViolationSchema = z.object({
  code: z.enum([
    'STRUCTURED_OUTPUTS_DISABLED',
    'STRUCTURED_NOT_USED',
    'JSON_ERROR',
    'JSON_EMPTY',
    'CORPUS_NOT_LOADED',
    'CITATIONS_TOO_LOW',
    'SOURCE_LEAK',
    'CITATION_ID_EMPTY',
  ]),
  message: z.string().min(1),
});

export const GeminiEnvelopeSchema = z
  .object({
    ok: z.boolean(),
    traceId: z.string().min(1),
    model: z.string().optional().default(''),
    mode: z.enum(['raw', 'oracle', 'guardian']),
    text: z.string().optional().default(''),
    json: z.unknown().nullable().optional(),
    jsonError: JsonErrorCodeSchema,
    rawJsonError: JsonErrorCodeSchema,
    finalJsonError: JsonErrorCodeSchema,
    raw: z
      .object({
        structured: z.boolean(),
        fallback: z.boolean(),
        repairApplied: z.boolean(),
        reason: z.string().nullable(),
        parseError: z.string().nullable(),
        rawJsonError: JsonErrorCodeSchema,
        retryCount: z.number().int().min(0),
      })
      .passthrough(),
    meta: z
      .object({
        structuredUsed: z.boolean(),
        rawStructured: z.boolean(),
        fallback: z.boolean(),
        repairApplied: z.boolean(),
        rawJsonError: JsonErrorCodeSchema,
        finalJsonError: JsonErrorCodeSchema,
        corpusLoaded: z.boolean(),
        citationsCount: z.number().int().min(0),
        sources: z.array(z.string()).default([]),
      })
      .passthrough(),
    citationsUsed: z
      .array(
        z
          .object({
            id: z.union([z.string(), z.number()]).optional().nullable(),
            source: z.string().optional().nullable(),
          })
          .passthrough(),
      )
      .default([]),
    knowledge: z
      .object({
        corpusLoaded: z.boolean(),
      })
      .passthrough()
      .optional(),
    violations: z.array(StrictViolationSchema).default([]),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .passthrough()
      .optional(),
    timings: z
      .object({
        totalMs: z.number().nonnegative(),
        llmMs: z.number().nonnegative().optional(),
        retrieveMs: z.number().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
    debug: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    if (val.jsonError !== val.finalJsonError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'jsonError must be an alias of finalJsonError',
        path: ['jsonError'],
      });
    }

    if (val.meta.rawStructured !== val.raw.structured) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meta.rawStructured must equal raw.structured',
        path: ['meta', 'rawStructured'],
      });
    }

    if (val.meta.fallback !== val.raw.fallback) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meta.fallback must equal raw.fallback',
        path: ['meta', 'fallback'],
      });
    }

    if (val.meta.repairApplied !== val.raw.repairApplied) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meta.repairApplied must equal raw.repairApplied',
        path: ['meta', 'repairApplied'],
      });
    }

    if (val.meta.rawJsonError !== val.raw.rawJsonError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'meta.rawJsonError must equal raw.rawJsonError',
        path: ['meta', 'rawJsonError'],
      });
    }

    if (val.mode !== 'raw') {
      const expectedStructuredUsed = val.finalJsonError === null;
      if (val.meta.structuredUsed !== expectedStructuredUsed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'structuredUsed must reflect final normalized state only',
          path: ['meta', 'structuredUsed'],
        });
      }
    }

    const hasJsonViolation = val.violations.some(
      (v) => v.code === 'JSON_ERROR',
    );
    if (val.finalJsonError === null && hasJsonViolation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'No JSON_ERROR violation allowed when finalJsonError is null',
        path: ['violations'],
      });
    }

    if (val.ok && val.violations.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ok=true forbids strict violations',
        path: ['ok'],
      });
    }
  });
