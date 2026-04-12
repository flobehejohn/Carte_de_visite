import { OracleResult, RitualInput } from '../domain/types';
import { geminiGenerate } from '../lib/geminiClient';
import { extractFirstJsonObject } from './jsonExtract';
import { normalizeVisualParams, VisualParams } from './visualParams';
import { ZaraLangGuard } from './zaraLangGuard';

export type ClimateSnapshot = {
  progress?: number;
  mood?: string;
  presetName?: string;
  palette?: { mode?: string; primary?: string; accent?: string };
  fog?: { enabled?: boolean; density?: number; color?: string | number };
  bloom?: { strength?: number; radius?: number; threshold?: number };
  volume?: {
    glowIntensity?: number;
    backgroundStrength?: number;
    softness?: number;
    vignette?: number;
  };
};

type OracleOptions = {
  climateSnapshot?: ClimateSnapshot | null;
  debug?: boolean;
};

const SAFE_FALLBACK_VISUAL: Required<
  Pick<
    VisualParams,
    'primary_color' | 'chaos' | 'fog_density' | 'shape_archetype'
  >
> = {
  primary_color: '#88aaff',
  chaos: 0.35,
  fog_density: 0.28,
  shape_archetype: 'torusKnot',
};

const LOG_THROTTLE_MS = 1200;

const GENERIC_GUARDIAN_PATTERNS = [
  /\best acceptable\b/i,
  /\bacceptable\b/i,
  /\bsans signal de danger\b/i,
  /\baucun signal de danger\b/i,
  /\bn apporte pas de sens\b/i,
  /\bmanque de sens\b/i,
  /\bvalide\b/i,
  /\bok\b/i,
  /\bpeut etre accepte\b/i,
  /\best recevable\b/i,
  /\ble texte est acceptable\b/i,
  /\ble prenom\b.*\best acceptable\b/i,
  /\ble nom\b.*\best acceptable\b/i,
  /\bnom ou prenom simple\b/i,
];

function createThrottledLogger(prefix: string, throttleMs = LOG_THROTTLE_MS) {
  let lastLogMs = 0;
  const canLog = () => {
    const now = Date.now();
    if (now - lastLogMs < throttleMs) return false;
    lastLogMs = now;
    return true;
  };
  return {
    log: (...args: any[]) => {
      if (!canLog()) return;
      // eslint-disable-next-line no-console
      console.info(`[${prefix}]`, ...args);
    },
    warn: (...args: any[]) => {
      if (!canLog()) return;
      // eslint-disable-next-line no-console
      console.warn(`[${prefix}]`, ...args);
    },
  };
}

const logger = createThrottledLogger('Zarathoustra');

function toAscii(input: unknown): string {
  const raw = String(input ?? '');
  try {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .trim();
  } catch {
    return raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').trim();
  }
}

function normalizeWhitespace(input: unknown): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripDiacritics(input: string): string {
  try {
    return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return input;
  }
}

function clip(input: string, max = 84): string {
  const clean = normalizeWhitespace(input);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function sanitizeRitualForPrompt(ritual: RitualInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ritual) return out;
  for (const [k, v] of Object.entries(ritual)) out[k] = toAscii(v);
  return out;
}

function quoted(value: string, fallback = 'cette parole'): string {
  const clean = clip(value, 72);
  return clean ? `« ${clean} »` : fallback;
}

function looksGuardianGeneric(comment: string): boolean {
  const clean = normalizeWhitespace(comment);
  if (!clean) return true;

  const ascii = stripDiacritics(clean.toLowerCase());
  if (clean.length < 28) return true;

  return GENERIC_GUARDIAN_PATTERNS.some((pattern) => pattern.test(ascii));
}

function buildGuardianComment(
  step: string,
  value: string,
  isSafe: boolean,
): string {
  const clean = normalizeWhitespace(value);

  if (!isSafe) {
    switch (step) {
      case 'name':
        return 'Le seuil ne refuse pas ce nom, mais il demande une présence un peu plus incarnée.';
      case 'question':
        return 'La question touche quelque chose, mais elle demande encore une tension plus nette pour porter le rite.';
      default:
        return 'Cette étape peut encore être reformulée pour gagner en justesse avant de poursuivre.';
    }
  }

  switch (step) {
    case 'name':
      return `${quoted(clean, 'ce nom')} suffit pour franchir le premier seuil : ici, un nom ouvre une présence, pas un simple formulaire.`;
    case 'mood':
      return `Sous le signe de ${quoted(clean, 'cette humeur')}, le rite reçoit déjà une météo intérieure ; garde cette couleur pour la suite.`;
    case 'format':
      return `${quoted(clean, 'cette forme')} donnera sa manière de frapper juste ; le réceptacle peut déjà porter la vérité.`;
    case 'question':
      return `Dans ${quoted(clean, 'cette question')}, on entend déjà une tension vivante entre manque et appel ; elle peut porter l’invocation.`;
    case 'weight':
      return `En nommant ${quoted(clean, 'ce fardeau')}, tu donnes au rite un poids réel ; quelque chose peut désormais être traversé.`;
    case 'fear':
      return `La peur nommée, ${quoted(clean, 'cette peur')}, cesse d’être pure brume ; elle devient un seuil que l’on peut regarder sans détour.`;
    case 'desire':
      return `Ton désir, ${quoted(clean, 'ce désir')}, trace déjà une direction ; il donne au tirage une orientation plus haute que le simple manque.`;
    case 'sacrifice':
      return `Ce que tu consens à quitter, ${quoted(clean, 'ce sacrifice')}, ouvre un passage ; le rite possède désormais une perte à honorer.`;
    case 'social':
      return `La place que tu te donnes parmi les autres est assez nette pour nourrir l’interprétation ; le cercle peut poursuivre.`;
    case 'eternity':
      return `Cette parole ouvre bien l’horizon du retour : elle donne au rite une durée intérieure, et non un simple instant isolé.`;
    default:
      return 'Le seuil peut recevoir cette parole ; tu peux poursuivre.';
  }
}

function normalizeGuardianComment(
  step: string,
  value: string,
  comment: string,
  isSafe: boolean,
): string {
  const raw = normalizeWhitespace(comment);
  if (!raw) return buildGuardianComment(step, value, isSafe);

  if (!isSafe) return raw;

  if (looksGuardianGeneric(raw)) {
    return buildGuardianComment(step, value, isSafe);
  }

  return raw;
}

/**
 * Unwrap robuste du retour de geminiGenerate()
 * - soit envelope /api/gemini: { ok, mode, text, json, ... }
 * - soit payload direct
 * - si json absent mais text contient du JSON => extractFirstJsonObject(text)
 */
function unwrapGeminiPayload(r: any): {
  env: any;
  payload: any;
  mode: string | null;
} {
  const env = r as any;
  const mode = env?.mode ? String(env.mode) : null;

  let payload: any = null;

  if (env && typeof env === 'object' && 'json' in env) payload = env.json;

  if (
    !payload &&
    env &&
    typeof env === 'object' &&
    (env.comment || env.quote || env.interpretation)
  ) {
    payload = env;
  }

  if (!payload && typeof env?.text === 'string') {
    payload = extractFirstJsonObject(env.text);
  }

  return { env, payload, mode };
}

function buildVisualParams(raw: any): VisualParams {
  const normalized = normalizeVisualParams(raw || {});
  const visualParams: VisualParams = {
    primary_color:
      normalized.primary_color ?? SAFE_FALLBACK_VISUAL.primary_color,
    chaos: normalized.chaos ?? SAFE_FALLBACK_VISUAL.chaos,
    fog_density: normalized.fog_density ?? SAFE_FALLBACK_VISUAL.fog_density,
    shape_archetype:
      normalized.shape_archetype ?? SAFE_FALLBACK_VISUAL.shape_archetype,
  };

  if (normalized.seed) visualParams.seed = normalized.seed;
  if (normalized.palette_mode)
    visualParams.palette_mode = normalized.palette_mode;
  if (normalized.wire_layers != null)
    visualParams.wire_layers = normalized.wire_layers;
  if (normalized.particle_density != null)
    visualParams.particle_density = normalized.particle_density;
  if (normalized.motion_signature)
    visualParams.motion_signature = normalized.motion_signature;

  return visualParams;
}

function pickSentenceFromCitations(data: any) {
  const citations = Array.isArray(data?.citations) ? data.citations : [];
  const citationIds = Array.isArray(data?.citation_ids)
    ? data.citation_ids.map((id: any) => String(id))
    : [];

  const firstMatching =
    citationIds.length > 0
      ? citations.find((c: any) => citationIds.includes(String(c?.id)))
      : null;

  return firstMatching || citations[0] || null;
}

function buildOracleResult(ritual: RitualInput, data: any): OracleResult {
  const quote = String(
    data?.quote || 'Le silence ne ferme rien : il demande une autre entrée.',
  );
  const interpretation = String(
    data?.interpretation ||
      'L’oracle demeure en attente, comme une porte encore à pousser.',
  );
  const keywords = Array.isArray(data?.keywords)
    ? data.keywords.map((k: any) => String(k))
    : [];

  const vpRaw =
    data?.visual_prescription ||
    data?.visualParams ||
    data?.visual_params ||
    {};
  const visualParams = buildVisualParams(vpRaw);

  const first = pickSentenceFromCitations(data);

  const sentence = {
    id: String(first?.id ?? `z-${Date.now()}`),
    text: String(first?.text ?? quote),
    part_title: String(first?.part_title ?? 'Zarathoustra'),
    section_title: String(first?.section_title ?? 'Source'),
  };

  const textLength = `${quote}${interpretation}`.length;

  return {
    sentence,
    quote,
    interpretation,
    keywords,
    ritual,
    tone: { sentiment: 0.5, intensity: 1.0, mysticism: 0.7 },
    themeScores: [],
    visualParams,
    textLength,
    seed: visualParams.seed,
    mainTheme: { themeId: 'will', score: 1, label: 'Volonte' },
  };
}

export async function getStepGuidance(
  step: string,
  value: string,
  opts?: { debug?: boolean },
): Promise<{ comment: string; isSafe: boolean }> {
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const stepA = toAscii(step);
    const valueA = toAscii(value);
    const valueDisplay = normalizeWhitespace(value);

    const prompt = [
      'Tu es le Gardien du Seuil.',
      'Tu verifies une etape du rituel et tu aides l utilisateur a poursuivre.',
      'Reponds en JSON strict.',
      'comment = une seule phrase courte, specifique a l etape, legerement rituelle, attentive aux mots fournis, jamais administrative.',
      'Si isSafe=true, le commentaire doit ouvrir la suite en interpretant legerement le texte.',
      'INTERDIT: "acceptable", "sans signal de danger", "valide", "ok", "n apporte pas de sens", "simple".',
      'Pour un prenom simple, transforme-le en seuil symbolique sobre.',
      'FORMAT JSON STRICT OBLIGATOIRE:',
      '{"comment": string, "isSafe": boolean, "confidence": number}',
      '',
      `ETAPE: ${stepA}`,
      `TEXTE: ${valueA}`,
    ].join('\n');

    const r = await geminiGenerate(prompt, {
      mode: 'guardian',
      step: stepA,
      value: valueA,
      expectJson: true,
      temperature: 0.2,
      maxOutputTokens: 500,
    });

    const { env, payload, mode } = unwrapGeminiPayload(r);
    if (!payload) {
      return {
        comment: buildGuardianComment(stepA, valueDisplay, true),
        isSafe: true,
      };
    }

    let comment = '';
    if (mode === 'guardian') {
      comment = String(payload?.comment ?? env?.text ?? '');
    } else if (mode === 'oracle') {
      comment = String(
        payload?.interpretation ?? payload?.quote ?? env?.text ?? '',
      );
    } else {
      comment = String(payload?.comment ?? env?.text ?? '');
    }

    const isSafe = Boolean(payload?.isSafe ?? payload?.is_safe ?? true);

    if (guard.shouldRetry(comment)) {
      comment = normalizeWhitespace(comment);
    }

    const normalizedComment = normalizeGuardianComment(
      stepA,
      valueDisplay,
      comment,
      isSafe,
    );

    return {
      comment:
        normalizedComment || buildGuardianComment(stepA, valueDisplay, isSafe),
      isSafe,
    };
  } catch (e) {
    logger.warn('Guardian error:', e);
    return {
      comment: buildGuardianComment(step, value, true),
      isSafe: true,
    };
  }
}

export async function consultOracle(
  ritual: RitualInput,
  opts?: OracleOptions,
): Promise<OracleResult> {
  logger.log('Invocation for:', ritual?.nameOrNickname || 'unknown');

  const cleanRitual = sanitizeRitualForPrompt(ritual);
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const prompt = [
      'Tu es Zarathoustra.',
      'Donne une reponse-oracle breve mais vivante.',
      'Tu dois t appuyer sur les citations fournies par le serveur.',
      'Lis les mots du rituel comme des signes en tension : peur, desir, sacrifice, poids, lien aux autres, retour.',
      'Integre les formulations de l utilisateur au lieu de les survoler.',
      'Produis une lecture symbolique, dynamique et philosophique, pas une simple validation.',
      'Si l entree est minimale, transforme-la en symbole vivant au lieu de la juger vide.',
      'Format JSON strict attendu.',
    ].join('\n');

    const r = await geminiGenerate(prompt, {
      mode: 'oracle',
      ritual: cleanRitual,
      climateSnapshot: opts?.climateSnapshot ?? null,
      expectJson: true,
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 1200,
    });

    const { payload } = unwrapGeminiPayload(r);
    if (!payload) {
      throw new Error('Oracle payload missing in API response.');
    }

    const result = buildOracleResult(ritual, payload);
    const combined = `${result.quote} ${result.interpretation}`;

    if (guard.shouldRetry(combined)) {
      throw new Error('Oracle output rejected by language guard.');
    }

    return result;
  } catch (error) {
    logger.warn('Oracle error:', error);
    throw error instanceof Error
      ? error
      : new Error('Oracle invocation failed.');
  }
}
