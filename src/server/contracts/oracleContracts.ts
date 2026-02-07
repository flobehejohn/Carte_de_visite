import { z } from 'zod';

export const CitationSchema = z.object({
  id: z.union([z.string(), z.number()]),
  text: z.string().min(1),
  part_title: z.string().optional(),
  section_title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  score: z.number().optional(),
  source: z.string().optional(),
});

export type Citation = z.infer<typeof CitationSchema>;

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

export const OracleJsonSchema = z
  .object({
    quote: z.string().min(1),
    interpretation: z.string().min(1),
    keywords: z.array(z.string()).default([]),

    // oracle must justify with citations
    citations: z.array(CitationSchema).min(1),

    delta: z.record(z.string(), z.unknown()).default({}),
    confidence: z.number().min(0).max(1).default(0.5),

    visual_prescription: VisualPrescriptionSchema.optional(),
  })
  .passthrough();

export type OracleJson = z.infer<typeof OracleJsonSchema>;

export const GuardianJsonSchema = z
  .object({
    comment: z.string().min(1),
    isSafe: z.boolean(),
    citations: z.array(CitationSchema).default([]),
    confidence: z.number().min(0).max(1).default(0.7),
  })
  .passthrough();

export type GuardianJson = z.infer<typeof GuardianJsonSchema>;
