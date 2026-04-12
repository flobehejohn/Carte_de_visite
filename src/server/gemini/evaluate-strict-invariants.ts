import type {
  NormalizedContractState,
  StrictViolation,
} from './contract-types.js';

export function evaluateStrictInvariants(
  state: NormalizedContractState,
  options: {
    minCitations: number;
    lockedSource: string;
    structuredOutputsOn?: boolean;
  },
): StrictViolation[] {
  const violations: StrictViolation[] = [];

  if (state.mode === 'raw') {
    return violations;
  }

  if (options.structuredOutputsOn === false) {
    violations.push({
      code: 'STRUCTURED_OUTPUTS_DISABLED',
      message: 'GEMINI_STRUCTURED_OUTPUTS=0 (structured outputs disabled)',
    });
  }

  if (!state.knowledge?.corpusLoaded) {
    violations.push({
      code: 'CORPUS_NOT_LOADED',
      message: 'knowledge.corpusLoaded !== true',
    });
  }

  const citations = state.citationsUsed ?? [];
  if (citations.length < options.minCitations) {
    violations.push({
      code: 'CITATIONS_TOO_LOW',
      message: `citationsUsed.length=${citations.length} < ${options.minCitations}`,
    });
  }

  if (citations.some((c) => String(c?.id ?? '').trim().length === 0)) {
    violations.push({
      code: 'CITATION_ID_EMPTY',
      message: 'one or more citationsUsed entries have empty id',
    });
  }

  const sources = Array.from(
    new Set(
      citations
        .map((x) => String(x?.source ?? '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (
    sources.length === 0 ||
    sources.some((source) => source !== options.lockedSource.toLowerCase())
  ) {
    violations.push({
      code: 'SOURCE_LEAK',
      message: `sources=${sources.join(',') || '(empty)'} expected=${options.lockedSource}`,
    });
  }

  if (state.finalJson == null) {
    violations.push({
      code: 'JSON_EMPTY',
      message: 'finalJson is null',
    });
  }

  if (state.finalJsonError !== null) {
    violations.push({
      code: 'JSON_ERROR',
      message: `finalJsonError=${state.finalJsonError}`,
    });
  }

  if (!state.structuredUsed) {
    violations.push({
      code: 'STRUCTURED_NOT_USED',
      message: 'final structured contract not retained',
    });
  }

  return violations;
}
