import { z } from 'zod';

const VisualPrescriptionSchema = z.object({
  primary_color: z.string().min(1),
  chaos: z.number(),
  fog_density: z.number(),
  shape_archetype: z.string().min(1),
});

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
