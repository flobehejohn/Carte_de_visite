import type { OracleAnchorRole } from '../contracts/oracle.types.js';

export type { OracleAnchorRole };

export const ORACLE_ANCHOR_ROLES: readonly OracleAnchorRole[] = [
  'anchor',
  'tension',
  'turn',
];

const ORACLE_ANCHOR_ROLE_ALIASES: Record<string, OracleAnchorRole> = {
  anchor: 'anchor',
  opening: 'anchor',
  foundation: 'anchor',
  fondation: 'anchor',
  fondateur: 'anchor',

  tension: 'tension',
  conflict: 'tension',
  warning: 'tension',
  avertissement: 'tension',
  observateur: 'tension',

  turn: 'turn',
  reversal: 'turn',
  pivot: 'turn',
  vision: 'turn',
  guide: 'turn',
};

export function normalizeOracleAnchorRole(
  value: unknown,
): OracleAnchorRole | null {
  const role = String(value ?? '')
    .trim()
    .toLowerCase();

  if (!role) {
    return null;
  }

  return ORACLE_ANCHOR_ROLE_ALIASES[role] ?? null;
}
