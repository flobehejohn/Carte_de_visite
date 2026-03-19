import type {
  NormalizedContractState,
  StrictViolationCode,
  StrictViolation,
} from './contract-types.js';
import type { OracleAnchorRole } from '../contracts/oracle.types.js';

const ORACLE_ANCHOR_ROLES: OracleAnchorRole[] = [
  'anchor',
  'tension',
  'turn',
];

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
  code: StrictViolationCode,
  message: string,
): void {
  violations.push({ code, message });
}

function normalizeOracleAnchorRole(value: unknown): OracleAnchorRole | null {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'anchor' || role === 'tension' || role === 'turn') {
    return role;
  }
  return null;
}

function listMissingOracleAnchorRoles(finalJson: unknown): OracleAnchorRole[] {
  if (!isRecord(finalJson) || !Array.isArray(finalJson.anchors)) {
    return [];
  }

  const present = new Set<OracleAnchorRole>();
  for (const anchor of finalJson.anchors) {
    if (!isRecord(anchor)) continue;
    const role = normalizeOracleAnchorRole(anchor.role);
    if (role) present.add(role);
  }

  return ORACLE_ANCHOR_ROLES.filter((role) => !present.has(role));
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
    const missingRoles = listMissingOracleAnchorRoles(state.finalJson);
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
