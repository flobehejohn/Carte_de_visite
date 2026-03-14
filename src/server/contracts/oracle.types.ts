import { z } from 'zod';
import {
  GuardianGuidanceSchema,
  OracleAnchorRoleSchema,
  OracleAnchorSchema,
  OracleCompositionSchema,
  OracleHermeneuticV2Schema,
} from '../../shared/contracts/gemini.contracts.js';

import {
  CitationSchema,
  GuardianJsonSchema,
  OracleJsonSchema,
  OracleRequestSchema,
  OracleResponseSchema,
  OrbDeltaSchema,
} from './oracle.schemas.js';

export type OracleRequest = z.infer<typeof OracleRequestSchema>;
export type OracleResponse = z.infer<typeof OracleResponseSchema>;

export type Citation = z.infer<typeof CitationSchema>;
export type OracleJson = z.infer<typeof OracleJsonSchema>;
export type GuardianJson = z.infer<typeof GuardianJsonSchema>;
export type OrbDelta = z.infer<typeof OrbDeltaSchema>;
export type GuardianGuidance = z.infer<typeof GuardianGuidanceSchema>;
export type OracleAnchorRole = z.infer<typeof OracleAnchorRoleSchema>;
export type OracleAnchor = z.infer<typeof OracleAnchorSchema>;
export type OracleHermeneuticV2 = z.infer<typeof OracleHermeneuticV2Schema>;
export type OracleComposition = z.infer<typeof OracleCompositionSchema>;
