import type {
  Citation,
  OracleComposition,
  OracleHermeneuticV2,
} from '../contracts/oracle.types.js';
import { validateOracleHermeneuticAnchors } from './oracle-hermeneutic.js';

function normalizeCitationId(value: unknown): string {
  return String(value ?? '').trim();
}

function getOptionalString(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const raw = value[field];
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export type OracleMotifEnrichmentResult =
  | {
      ok: true;
      motifs: OracleComposition['motifs'];
    }
  | {
      ok: false;
      error: string;
      missingCitationIds: string[];
    };

export function enrichOracleCompositionMotifs(
  hermeneutic: OracleHermeneuticV2,
  citationsUsed: Citation[],
): OracleMotifEnrichmentResult {
  const anchorValidation = validateOracleHermeneuticAnchors(
    hermeneutic,
    citationsUsed,
  );

  if (!anchorValidation.ok) {
    return {
      ok: false,
      error: anchorValidation.error,
      missingCitationIds: anchorValidation.missingCitationIds,
    };
  }

  const citationById = new Map(
    citationsUsed
      .map((citation) => [normalizeCitationId(citation.id), citation] as const)
      .filter(([id]) => id.length > 0),
  );

  const missingCitationIds: string[] = [];
  const motifs: OracleComposition['motifs'] = [];

  for (const anchor of hermeneutic.anchors) {
    const citationId = normalizeCitationId(anchor.citation_id);
    const citation = citationById.get(citationId);

    if (!citation) {
      missingCitationIds.push(citationId);
      continue;
    }

    const citationRecord = citation as Record<string, unknown>;
    const partTitle = getOptionalString(citationRecord, 'part_title');
    const sectionTitle =
      getOptionalString(citationRecord, 'section_title') ??
      getOptionalString(citationRecord, 'title');

    motifs.push({
      citation_id: citationId,
      role: anchor.role,
      motif: anchor.motif.trim(),
      claim: anchor.claim.trim(),
      part_title: partTitle,
      section_title: sectionTitle,
    });
  }

  if (missingCitationIds.length > 0) {
    return {
      ok: false,
      error: `Missing oracle composition citation(s): ${missingCitationIds.join(', ')}`,
      missingCitationIds,
    };
  }

  return {
    ok: true,
    motifs,
  };
}
