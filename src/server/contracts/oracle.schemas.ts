import { z } from 'zod';

export const JsonErrorCodeSchema = z.enum([
  'NONE',
  'INVALID_REQUEST',
  'MISSING_API_KEY',
  'UPSTREAM_ERROR',
  'INVALID_JSON_FROM_LLM',
  'KNOWLEDGE_EMPTY',
  'KNOWLEDGE_CORRUPTED',
  'INTERNAL_ERROR',
]);

export const TimingsSchema = z
  .object({
    totalMs: z.number().nonnegative(),
    llmMs: z.number().nonnegative().optional(),
    retrieveMs: z.number().nonnegative().optional(),
  })
  .passthrough();

export const OracleRequestSchema = z
  .object({
    traceId: z.string().optional(),
    prompt: z.string().min(1),
    mode: z.string().min(1).optional(),
    wantCitations: z.boolean().optional(),
    minCitations: z.number().int().nonnegative().optional(),

    ritual: z
      .object({
        step: z.string().optional(),
        intent: z.string().optional(),
      })
      .passthrough()
      .optional(),
    climateSnapshot: z.unknown().optional(),
    step: z.string().optional(),
    value: z.string().optional(),

    model: z.string().optional(),
    temperature: z.number().optional(),
    topP: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    expectJson: z.boolean().optional(),
  })
  .passthrough();

/**
 * Citation “wire-safe”
 */
export const CitationSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    source: z.string().optional(),
    title: z.string().optional(),
    url: z.string().optional(),
    quote: z.string().optional(),
    score: z.number().optional(),
  })
  .passthrough();

export const ModelCitationSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    text: z.string().optional(),
    score: z.coerce.number().optional(),
    source: z.string().optional(),

    title: z.string().optional(),
    section: z.string().optional(),
    url: z.string().optional(),

    part_title: z.string().optional(),
    section_title: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export const VisualPrescriptionSchema = z
  .object({
    primary_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, { message: 'invalid hex color' })
      .optional(),
    chaos: z.number().min(0).max(1).optional(),
    fog_density: z.number().min(0).max(1).optional(),
    shape_archetype: z.string().optional(),

    palette_mode: z.string().optional(),
    wire_layers: z.number().int().optional(),
    particle_density: z.number().min(0).max(1).optional(),
    motion_signature: z.string().optional(),
    seed: z.string().optional(),
  })
  .passthrough();

export const OrbDeltaSchema = z
  .object({
    mood: z.number().min(-1).max(1).optional(),
    tension: z.number().min(-1).max(1).optional(),
    clarity: z.number().min(-1).max(1).optional(),
  })
  .passthrough();

export const OracleJsonSchema = z
  .object({
    quote: z.string().min(1),
    interpretation: z.string().min(1),
    keywords: z.array(z.string()).default([]),
    citations: z.array(ModelCitationSchema).default([]),
    delta: OrbDeltaSchema.optional().default({}),
    confidence: z.number().min(0).max(1).optional().default(0.5),
    visual_prescription: VisualPrescriptionSchema.optional(),
  })
  .passthrough();

export const GuardianJsonSchema = z
  .object({
    comment: z.string().min(1),
    isSafe: z.boolean(),
    citations: z.array(ModelCitationSchema).default([]),
    confidence: z.number().min(0).max(1).optional().default(0.7),
  })
  .passthrough();

export const OracleResponseSchema = z
  .object({
    traceId: z.string().min(1),
    model: z.string().optional().default(''),
    mode: z.enum(['raw', 'oracle', 'guardian']),
    text: z.string(),

    json: z.unknown().nullable().default(null),
    jsonError: JsonErrorCodeSchema.nullable().optional().default(null),

    citationsUsed: z.array(CitationSchema).default([]),

    knowledge: z
      .object({
        corpusLoaded: z.boolean(),
        corpusSize: z.number().int().nonnegative(),
        corpusHash: z.string().optional(),
        retrieverVersion: z.string(),
        integrityMode: z.string().optional(),
      })
      .passthrough()
      .optional(),

    raw: z.unknown().optional(),
  })
  .passthrough();

/**
 * Wire envelope (HTTP response body)
 */
export const ApiErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    traceId: z.string().min(1),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .passthrough(),
    timings: TimingsSchema.partial().optional(),
  })
  .passthrough();

export const ApiSuccessEnvelopeSchema = OracleResponseSchema.extend({
  ok: z.literal(true),
  timings: TimingsSchema,
}).passthrough();

export const ApiEnvelopeSchema = z.union([
  ApiSuccessEnvelopeSchema,
  ApiErrorEnvelopeSchema,
]);
