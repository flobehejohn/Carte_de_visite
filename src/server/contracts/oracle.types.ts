import { z } from 'zod';

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
