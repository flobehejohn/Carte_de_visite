import type {
  NormalizedContractState,
  StrictViolation,
} from './contract-types.js';
import { listMissingOracleAnchorRoles } from './oracle-hermeneutic.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTrimmedString(
  value: Record<string, unknown>,
  field: string,
): string {
  const raw = value[field];
  return typeof raw === 'string' ? raw.trim() : '';
}

function pushViolation(
  violations: StrictViolation[],
  code: StrictViolation['code'],
  message: string,
): void {
  violations.push({ code, message });
}

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
    pushViolation(
      violations,
      'STRUCTURED_OUTPUTS_DISABLED',
      'GEMINI_STRUCTURED_OUTPUTS=0 (structured outputs disabled)',
    );
  }

  if (!state.knowledge?.corpusLoaded) {
    pushViolation(
      violations,
      'CORPUS_NOT_LOADED',
      'knowledge.corpusLoaded !== true',
    );
  }

  const citations = state.citationsUsed ?? [];

  if (citations.length < options.minCitations) {
    pushViolation(
      violations,
      'CITATIONS_TOO_LOW',
      `citationsUsed.length=${citations.length} < ${options.minCitations}`,
    );
  }

  if (citations.some((c) => String(c?.id ?? '').trim().length === 0)) {
    pushViolation(
      violations,
      'CITATION_ID_EMPTY',
      'one or more citationsUsed entries have empty id',
    );
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
    pushViolation(
      violations,
      'SOURCE_LEAK',
      `sources=${sources.join(',') || '(empty)'} expected=${options.lockedSource}`,
    );
  }

  if (state.finalJson == null) {
    pushViolation(violations, 'JSON_EMPTY', 'finalJson is null');
  }

  if (state.finalJsonError !== null) {
    pushViolation(
      violations,
      'JSON_ERROR',
      `finalJsonError=${state.finalJsonError}`,
    );
  }

  if (!state.structuredUsed) {
    pushViolation(
      violations,
      'STRUCTURED_NOT_USED',
      'final structured contract not retained',
    );
  }

  const hasValidGovernedState =
    state.finalJson !== null && state.finalJsonError === null;

  if (state.mode === 'guardian' && hasValidGovernedState) {
    if (!isRecord(state.guidance)) {
      pushViolation(
        violations,
        'GUIDANCE_MISSING',
        'guardian guidance is missing from the final response',
      );
    } else {
      if (getTrimmedString(state.guidance, 'echo').length === 0) {
        pushViolation(
          violations,
          'GUIDANCE_EMPTY_ECHO',
          'guardian guidance echo is empty',
        );
      }

      if (getTrimmedString(state.guidance, 'subcomment').length === 0) {
        pushViolation(
          violations,
          'GUIDANCE_EMPTY_SUBCOMMENT',
          'guardian guidance subcomment is empty',
        );
      }
    }
  }

  if (state.mode === 'oracle' && hasValidGovernedState) {
    const missingRoles = isRecord(state.finalJson)
      ? listMissingOracleAnchorRoles(state.finalJson as any)
      : [];

    if (missingRoles.length > 0) {
      pushViolation(
        violations,
        'ANCHOR_ROLE_COVERAGE_MISSING',
        `oracle anchor roles missing=${missingRoles.join(',')}`,
      );
    }

    if (
      !isRecord(state.composition) ||
      getTrimmedString(state.composition, 'prose').length === 0
    ) {
      pushViolation(
        violations,
        'COMPOSITION_EMPTY',
        'oracle composition prose is missing or empty',
      );
    }
  }

  return violations;
}
