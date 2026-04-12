import { z } from 'zod';

const VisualPrescriptionSchema = z.object({
  primary_color: z.string().min(1),
  chaos: z.number(),
  fog_density: z.number(),
  shape_archetype: z.string().min(1),
});

export const GuardianGuidanceSchema = z
  .object({
    echo: z.string(),
    subcomment: z.string(),
    unsafeHint: z.string().nullable().optional(),
  })
  .strict();

export const OracleAnchorRoleSchema = z.enum([
  'anchor',
  'tension',
  'turn',
]);

export const OracleAnchorSchema = z
  .object({
    citation_id: z.string().trim().min(1),
    role: OracleAnchorRoleSchema,
    motif: z.string().trim().min(1).max(120),
    claim: z.string().trim().min(1),
  })
  .strict();

export const OracleHermeneuticVisualPrescriptionSchema = z
  .object({
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    chaos: z.number().min(0).max(1),
    fog_density: z.number().min(0).max(1),
    shape_archetype: z.string().trim().min(1),
  })
  .strict();

export const OracleHermeneuticV2Schema = z
  .object({
    quote: z.string().trim().min(1),
    opening_image: z.string().trim().min(1),
    central_tension: z.string().trim().min(1),
    reversal: z.string().trim().min(1),
    imperative: z.string().trim().min(1),
    return_axis: z.string().trim().min(1),
    keywords: z.array(z.string().trim().min(1)).min(4).max(10),
    anchors: z.array(OracleAnchorSchema).min(2).max(4),
    visual_prescription: OracleHermeneuticVisualPrescriptionSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const OracleCompositionBlocksSchema = z
  .object({
    opening: z.string().trim().min(1),
    tension: z.string().trim().min(1),
    turn: z.string().trim().min(1),
    imperative: z.string().trim().min(1),
  })
  .strict();

export const OracleCompositionMotifSchema = z
  .object({
    citation_id: z.string().trim().min(1),
    role: OracleAnchorRoleSchema,
    motif: z.string().trim().min(1).max(120),
    claim: z.string().trim().min(1),
    part_title: z.string().trim().min(1).optional(),
    section_title: z.string().trim().min(1).optional(),
  })
  .strict();

export const OracleCompositionSchema = z
  .object({
    prose: z.string().trim().min(1),
    blocks: OracleCompositionBlocksSchema,
    motifs: z.array(OracleCompositionMotifSchema),
  })
  .strict();

export const OracleStructuredSchema = z
  .object({
    quote: z.string().min(1),
    interpretation: z.string().min(1),
    keywords: z.array(z.string().min(1)).min(1).max(12),
    citation_ids: z.array(z.string().min(1)).min(2).max(64),
    visual_prescription: VisualPrescriptionSchema,

    // FIX: z.record() nécessite keySchema + valueSchema (2 args) sur ta version de Zod
    // Ici: Record<string, number>
    delta: z.record(z.string(), z.number()).optional().default({}),

    confidence: z.number(),
  })
  .passthrough();

export const GuardianStructuredSchema = z
  .object({
    comment: z.string().min(1),
    isSafe: z.boolean(),
    confidence: z.number(),
    citation_ids: z.array(z.string().min(1)).max(64).optional(),
  })
  .passthrough();
