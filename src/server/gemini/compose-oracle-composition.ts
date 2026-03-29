import { OracleCompositionSchema } from '../../shared/contracts/gemini.contracts.js';
import type {
  OracleComposition,
  OracleHermeneuticV2,
} from '../contracts/oracle.types.js';

function normalizeFragment(value: string): string {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[.!?]+/g, ',')
    .replace(/[:;]+/g, ',')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,\s]+|[,\s]+$/g, '');
}

function lowerFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function toSentence(...parts: Array<string | undefined>): string {
  const normalized = parts
    .map((part) => normalizeFragment(String(part ?? '')))
    .filter((part) => part.length > 0);

  return normalized.join('; ') + '.';
}

function pickMotif(
  motifs: OracleComposition['motifs'],
  role: OracleComposition['motifs'][number]['role'],
  fallbackIndex: number,
): OracleComposition['motifs'][number] {
  return motifs.find((motif) => motif.role === role) ?? motifs[fallbackIndex];
}

function renderTitleLead(motif: OracleComposition['motifs'][number]): string {
  const sectionTitle = normalizeFragment(motif.section_title ?? '');
  const partTitle = normalizeFragment(motif.part_title ?? '');

  if (sectionTitle) {
    return `Sous ${sectionTitle.toLowerCase()}`;
  }

  if (partTitle) {
    return `Dans ${partTitle.toLowerCase()}`;
  }

  return '';
}

function renderSupportClause(
  motif: OracleComposition['motifs'][number],
): string {
  const titleLead = renderTitleLead(motif);
  const claim = lowerFirst(normalizeFragment(motif.claim));

  if (titleLead) {
    return `${titleLead}, ${claim}`;
  }

  return `Le motif de ${normalizeFragment(motif.motif)} insiste, ${claim}`;
}

export function composeOracleComposition(
  hermeneutic: OracleHermeneuticV2,
  motifs: OracleComposition['motifs'],
): OracleComposition {
  const anchorMotif = pickMotif(motifs, 'anchor', 0);
  const tensionMotif = pickMotif(motifs, 'tension', 1);
  const turnMotif = pickMotif(motifs, 'turn', motifs.length - 1);

  const openingImage = normalizeFragment(hermeneutic.opening_image);
  const openingMotifClause = `Le motif de ${normalizeFragment(anchorMotif.motif)} ouvre le passage`;

  const blocks: OracleComposition['blocks'] = {
    opening: toSentence(hermeneutic.quote, openingImage, openingMotifClause),
    tension: toSentence(
      hermeneutic.central_tension,
      renderSupportClause(tensionMotif),
    ),
    turn: toSentence(hermeneutic.reversal, renderSupportClause(turnMotif)),
    imperative: toSentence(hermeneutic.imperative, hermeneutic.return_axis),
  };

  return OracleCompositionSchema.parse({
    prose: [
      blocks.opening,
      blocks.tension,
      blocks.turn,
      blocks.imperative,
    ].join(' '),
    blocks,
    motifs,
  });
}
