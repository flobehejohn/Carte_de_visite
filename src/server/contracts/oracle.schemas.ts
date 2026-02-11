import { z } from 'zod';

export const OracleRequestSchema = z
  .object({
    traceId: z.string().optional(),
    prompt: z.string().optional(),
    mode: z.enum(['raw', 'oracle', 'guardian', 'json']).optional(),
    wantCitations: z.boolean().optional(),

    ritual: z.record(z.string(), z.unknown()).optional(),
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

export const CitationSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  score: z.number(),
  source: z.literal('zarathoustra'),
  part_title: z.string().optional(),
  section_title: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const ModelCitationSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    text: z.string().optional(),
    part_title: z.string().optional(),
    section_title: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export const VisualPrescriptionSchema = z
  .object({
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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
    traceId: z.string(),
    model: z.string().optional().default(''),
    mode: z.enum(['raw', 'oracle', 'guardian']),
    text: z.string(),
    json: z.unknown().nullable(),
    jsonError: z.string().nullable(),
    citationsUsed: z.array(CitationSchema),
    knowledge: z
      .object({
        corpusLoaded: z.boolean(),
        corpusSize: z.number().int().nonnegative(),
        corpusHash: z.string().optional(),
        retrieverVersion: z.string(),
        integrityMode: z.string().optional(),
      })
      .optional(),
    raw: z.unknown().optional(),
  })
  .passthrough();
