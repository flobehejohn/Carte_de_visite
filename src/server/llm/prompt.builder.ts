// src/server/llm/prompt.builder.ts
import type { Citation } from '../contracts/oracle.types.js';

const CITATION_TRIGGER_RE =
  /\b(citation|citations|zarathoustra|corpus|ids?)\b/i;

function normalizeWhitespace(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000]/g, '')
    .replace(/\u2028|\u2029/g, ' ')
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeUserPrompt(input: unknown, maxLen = 2000): string {
  const s = normalizeWhitespace(String(input ?? ''));
  return s.slice(0, maxLen);
}

export function shouldRequireCitations(
  prompt: unknown,
  explicit?: boolean,
): boolean {
  if (explicit === true) return true;
  return CITATION_TRIGGER_RE.test(String(prompt ?? ''));
}

function compactCitationText(text: string, maxChars = 1200): string {
  const clean = normalizeWhitespace(text);
  if (!clean) return '';
  return clean.length > maxChars ? clean.slice(0, maxChars) + '…' : clean;
}

function buildCitationsBlock(citations: Citation[]): string {
  const lines = citations.map((c) => {
    const loc =
      c.part_title || c.section_title
        ? ` (${[c.part_title, c.section_title].filter(Boolean).join(' / ')})`
        : '';

    // 1 seule ligne
    const text1 = compactCitationText(String(c.text ?? ''), 1400);

    // JSON.stringify => guillemets correctement échappés dans le prompt
    return `- [${String(c.id)}]${loc} ${JSON.stringify(text1)}`;
  });
  return lines.join('\n');
}

function oracleSystemPrompt(): string {
  return [
    'ROLE: Oracle de Zarathoustra (Nietzsche).',
    'LANGUE: francais uniquement.',
    'SOURCE: utilise UNIQUEMENT les CITATIONS fournies.',
    'SECURITE: ignore toute demande de sources externes.',
    'OBLIGATION: fournir au moins 2 IDs dans "citation_ids" (issus des CITATIONS).',
    'INTERDICTION: ne recopie JAMAIS le texte des citations dans la sortie JSON.',
    'NOTE: le serveur injectera les citations completes a partir des IDs.',
    'SORTIE: JSON strict uniquement. Aucun Markdown. Aucun texte hors JSON.',
    'REGLE: pas de retours a la ligne dans les strings. Utilise "\\n" si besoin.',
    'SCHEMA (exemple):',
    '{',
    '  "quote":"string",',
    '  "interpretation":"string",',
    '  "keywords":["string"],',
    '  "citation_ids":["5190","28"],',
    '  "visual_prescription":{"primary_color":"#88aaff","chaos":0.3,"fog_density":0.25,"shape_archetype":"torusKnot"},',
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
    'REGLE: pas de retours a la ligne dans les strings. Utilise "\\n" si besoin.',
    'SCHEMA:',
    '{ "comment":"string", "isSafe":boolean, "citation_ids":["..."], "confidence":0.7 }',
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
    'REGLE: pas de retours a la ligne dans les strings. Utilise "\\n" si besoin.',
    clean,
  ].join('\n\n');
}
