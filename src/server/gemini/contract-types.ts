export type GeminiMode = 'raw' | 'oracle' | 'guardian';

export type JsonErrorCode =
  | null
  | 'INVALID_JSON_FROM_LLM'
  | 'SCHEMA_VALIDATION_FAILED';

export type StrictViolationCode =
  | 'STRUCTURED_OUTPUTS_DISABLED'
  | 'STRUCTURED_NOT_USED'
  | 'JSON_ERROR'
  | 'JSON_EMPTY'
  | 'CORPUS_NOT_LOADED'
  | 'CITATIONS_TOO_LOW'
  | 'SOURCE_LEAK'
  | 'CITATION_ID_EMPTY';

export type CitationLike = {
  id?: string | number | null;
  source?: string | null;
} & Record<string, unknown>;

export type RawContractMeta = {
  structured: boolean;
  fallback: boolean;
  repairApplied: boolean;
  reason: string | null;
  parseError: string | null;
  rawJsonError: JsonErrorCode;
  retryCount: number;
  parseStage?: string | null;
  preview?: string | null;
  parsedPreview?: string | null;
  issues?: unknown;
  error?: string | null;
};

export type StrictViolation = {
  code: StrictViolationCode;
  message: string;
};

export type NormalizedContractState<TJson = unknown> = {
  mode: GeminiMode;
  finalJson: TJson | null;
  finalJsonError: JsonErrorCode;
  schemaValid: boolean;
  structuredUsed: boolean;
  raw: RawContractMeta;
  citationsUsed: CitationLike[];
  knowledge: { corpusLoaded?: boolean | null } | null | undefined;
};
