import type {
  Citation,
  OracleAnchorRole,
  OracleHermeneuticV2,
} from '../contracts/oracle.types.js';

const ORACLE_ANCHOR_ROLES: OracleAnchorRole[] = [
  'anchor',
  'tension',
  'turn',
];

const ORACLE_ANCHOR_ROLE_SYNONYMS: Record<string, OracleAnchorRole> = {
  fondation: 'anchor',
  fondateur: 'anchor',
  avertissement: 'tension',
  observateur: 'tension',
  vision: 'turn',
  guide: 'turn',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCitationId(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeOracleAnchorRole(value: unknown): OracleAnchorRole | null {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'anchor' || role === 'tension' || role === 'turn') {
    return role;
  }
  return ORACLE_ANCHOR_ROLE_SYNONYMS[role] ?? null;
}

export function normalizeOracleHermeneuticRoles(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.anchors)) {
    return input;
  }

  return {
    ...input,
    anchors: input.anchors.map((anchor) => {
      if (!isRecord(anchor)) return anchor;

      return {
        ...anchor,
        role:
          normalizeOracleAnchorRole(anchor.role) ??
          String(anchor.role ?? '').trim(),
      };
    }),
  };
}

export function collectOracleAnchorRoles(
  hermeneutic: Pick<OracleHermeneuticV2, 'anchors'>,
): Set<OracleAnchorRole> {
  return new Set(
    hermeneutic.anchors.map((anchor) => anchor.role) as OracleAnchorRole[],
  );
}

export function listMissingOracleAnchorRoles(
  hermeneutic: Pick<OracleHermeneuticV2, 'anchors'>,
): OracleAnchorRole[] {
  const present = collectOracleAnchorRoles(hermeneutic);
  return ORACLE_ANCHOR_ROLES.filter((role) => !present.has(role));
}

export function validateOracleHermeneuticAnchors(
  hermeneutic: OracleHermeneuticV2,
  citationsUsed: Citation[],
):
  | {
      ok: true;
      missingRoles: OracleAnchorRole[];
    }
  | {
      ok: false;
      error: string;
      missingCitationIds: string[];
      missingRoles: OracleAnchorRole[];
    } {
  const resolvedIds = new Set(
    citationsUsed
      .map((citation) => normalizeCitationId(citation.id))
      .filter((id) => id.length > 0),
  );

  const missingCitationIds = Array.from(
    new Set(
      hermeneutic.anchors
        .map((anchor) => normalizeCitationId(anchor.citation_id))
        .filter((id) => id.length > 0 && !resolvedIds.has(id)),
    ),
  );

  const missingRoles = listMissingOracleAnchorRoles(hermeneutic);

  if (missingCitationIds.length > 0) {
    return {
      ok: false,
      error: `Unknown oracle anchor citation_id(s): ${missingCitationIds.join(', ')}`,
      missingCitationIds,
      missingRoles,
    };
  }

  return {
    ok: true,
    missingRoles,
  };
}
