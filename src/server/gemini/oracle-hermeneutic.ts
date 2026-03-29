import type {
  Citation,
  OracleAnchorRole,
  OracleHermeneuticV2,
} from '../contracts/oracle.types.js';
import {
  normalizeOracleAnchorRole,
  ORACLE_ANCHOR_ROLES,
} from './oracle-anchor-role.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeCitationId(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeOracleHermeneuticRoles(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input.anchors)) {
    return input;
  }

  return {
    ...input,
    anchors: input.anchors.map((anchor) => {
      if (!isRecord(anchor)) {
        return anchor;
      }

      const normalized = normalizeOracleAnchorRole(anchor.role);

      return {
        ...anchor,
        role: normalized ?? String(anchor.role ?? '').trim(),
      };
    }),
  };
}

export function collectOracleAnchorRoles(
  hermeneutic: Pick<OracleHermeneuticV2, 'anchors'>,
): Set<OracleAnchorRole> {
  const roles = new Set<OracleAnchorRole>();

  for (const anchor of hermeneutic.anchors ?? []) {
    const normalized = normalizeOracleAnchorRole((anchor as any)?.role);
    if (normalized) {
      roles.add(normalized);
    }
  }

  return roles;
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
      (hermeneutic.anchors ?? [])
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
