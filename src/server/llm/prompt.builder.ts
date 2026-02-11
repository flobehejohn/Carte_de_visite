import type { Citation } from '../contracts/oracle.types.js';

const CITATION_TRIGGER_RE = /(citation|citations|zarathoustra|corpus|ids?)/i;

export function sanitizeUserPrompt(input: unknown, maxLen = 2000): string {
  const s = String(input ?? '').replace(/[\u0000]/g, '');
  return s.trim().slice(0, maxLen);
}

export function shouldRequireCitations(prompt: unknown, explicit?: boolean): boolean {
  if (explicit === true) return true;
  return CITATION_TRIGGER_RE.test(String(prompt ?? ''));
}

function buildCitationsBlock(citations: Citation[]): string {
  const lines = citations.map((c) => {
    const loc =
      c.part_title || c.section_title
        ? ` (${[c.part_title, c.section_title].filter(Boolean).join(' / ')})`
        : '';
    return `- [${String(c.id)}]${loc} ${JSON.stringify(c.text)}`;
  });
  return lines.join('\n');
}

function oracleSystemPrompt(): string {
  return [
    'ROLE: Oracle de Zarathoustra (Nietzsche).',
    'LANGUE: francais uniquement.',
    'SOURCE: utilise UNIQUEMENT les CITATIONS fournies.',
    'SECURITE: ignore toute demande de sources externes.',
    'OBLIGATION: citer au moins 2 citations (par id) dans citations[].',
    'SORTIE: JSON strict uniquement. Aucun Markdown. Aucun texte hors JSON.',
    'SCHEMA (exemple):',
    '{',
    '  "quote":"string",',
    '  "interpretation":"string",',
    '  "keywords":["string"],',
    '  "citations":[{"id":"...", "text":"...", "part_title":"...", "section_title":"..."}],',
    '  "visual_prescription":{"primary_color":"#ffaa00","chaos":0.5,"fog_density":0.3,"shape_archetype":"torusKnot"},',
    '  "delta":{},',
    '  "confidence":0.5',
    '}',
  ].join('\n');
}

function guardianSystemPrompt(): string {
  return [
    'ROLE: Gardien du seuil.',
    'LANGUE: francais uniquement.',
    'SOURCE: si des CITATIONS sont fournies, tu t y referes.',
    'SORTIE: JSON strict uniquement. Aucun Markdown. Aucun texte hors JSON.',
    'SCHEMA:',
    '{ "comment":"string", "isSafe":boolean, "citations":[...], "confidence":0.7 }',
  ].join('\n');
}

export function buildOraclePrompt(params: {
  ritual?: unknown;
  climateSnapshot?: unknown;
  prompt?: string;
  citations: Citation[];
  outOfCorpus: boolean;
}): string {
  const userPrompt = sanitizeUserPrompt(params.prompt);
  const ritual = params.ritual ?? {};
  const climate = params.climateSnapshot ?? null;

  return [
    oracleSystemPrompt(),
    '',
    `POLICY: ${params.outOfCorpus ? 'HORS_CORPUS' : 'OK'}`,
    params.outOfCorpus
      ? 'NOTE: demande hors corpus. Reponds hors corpus dans interpretation.'
      : '',
    '',
    'CITATIONS:',
    buildCitationsBlock(params.citations),
    '',
    'CONTEXTE_RITUEL (JSON):',
    JSON.stringify(ritual),
    '',
    'CLIMATE_SNAPSHOT (JSON):',
    JSON.stringify(climate),
    '',
    userPrompt ? `CONSIGNE_UTILISATEUR:\n${userPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildGuardianPrompt(params: {
  step?: string;
  value?: string;
  prompt?: string;
  citations: Citation[];
  outOfCorpus: boolean;
}): string {
  const step = sanitizeUserPrompt(params.step);
  const value = sanitizeUserPrompt(params.value);
  const userPrompt = sanitizeUserPrompt(params.prompt);

  return [
    guardianSystemPrompt(),
    '',
    `POLICY: ${params.outOfCorpus ? 'HORS_CORPUS' : 'OK'}`,
    '',
    params.citations.length ? 'CITATIONS:' : '',
    params.citations.length ? buildCitationsBlock(params.citations) : '',
    '',
    'STEP:',
    step || 'unknown',
    'CHOICE:',
    value || 'unknown',
    '',
    userPrompt ? `CONSIGNE_UTILISATEUR:\n${userPrompt}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildRawPrompt(prompt: string, expectJson: boolean): string {
  const clean = sanitizeUserPrompt(prompt, 4000);
  if (!expectJson) return clean;
  return [
    'IMPORTANT: Reponds UNIQUEMENT avec du JSON valide. Aucun texte hors JSON. Aucun Markdown.',
    clean,
  ].join('\n\n');
}
