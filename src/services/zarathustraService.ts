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

export type GuardianSymbolicFocus =
  | 'threshold'
  | 'climate'
  | 'burden'
  | 'fracture'
  | 'desire'
  | 'renunciation'
  | 'circle'
  | 'return'
  | 'form'
  | 'question'
  | 'unknown';

export type GuardianMovement =
  | 'opening'
  | 'deepening'
  | 'clarifying'
  | 'crossing'
  | 'naming'
  | 'orienting'
  | 'releasing'
  | 'holding'
  | 'receiving';

export type GuardianTone = 'calm' | 'grave' | 'ardent' | 'clear';

export type GuardianGuidance = {
  comment: string;
  echo: string;
  subcomment: string;
  isSafe: boolean;
  confidence: number;
  symbolic_focus: GuardianSymbolicFocus;
  movement: GuardianMovement;
  tone: GuardianTone;
  rewrite_hint: string;
};

type GuardianPayloadLike = {
  comment?: unknown;
  isSafe?: unknown;
  is_safe?: unknown;
  confidence?: unknown;
  symbolic_focus?: unknown;
  movement?: unknown;
  tone?: unknown;
  rewrite_hint?: unknown;
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

const GUARDIAN_STEP_DEFAULTS: Record<
  string,
  {
    symbolic_focus: GuardianSymbolicFocus;
    movement: GuardianMovement;
    tone: GuardianTone;
    rewrite_hint: string;
  }
> = {
  name: {
    symbolic_focus: 'threshold',
    movement: 'opening',
    tone: 'calm',
    rewrite_hint: 'name-opens-threshold',
  },
  mood: {
    symbolic_focus: 'climate',
    movement: 'deepening',
    tone: 'calm',
    rewrite_hint: 'mood-colors-climate',
  },
  weight: {
    symbolic_focus: 'burden',
    movement: 'holding',
    tone: 'grave',
    rewrite_hint: 'weight-gives-gravity',
  },
  fear: {
    symbolic_focus: 'fracture',
    movement: 'clarifying',
    tone: 'grave',
    rewrite_hint: 'fear-becomes-visible-threshold',
  },
  desire: {
    symbolic_focus: 'desire',
    movement: 'orienting',
    tone: 'ardent',
    rewrite_hint: 'desire-points-direction',
  },
  sacrifice: {
    symbolic_focus: 'renunciation',
    movement: 'releasing',
    tone: 'grave',
    rewrite_hint: 'sacrifice-opens-passage',
  },
  social: {
    symbolic_focus: 'circle',
    movement: 'clarifying',
    tone: 'clear',
    rewrite_hint: 'social-place-clarifies-circle',
  },
  eternity: {
    symbolic_focus: 'return',
    movement: 'deepening',
    tone: 'grave',
    rewrite_hint: 'eternity-opens-return',
  },
  format: {
    symbolic_focus: 'form',
    movement: 'receiving',
    tone: 'clear',
    rewrite_hint: 'format-shapes-truth',
  },
  question: {
    symbolic_focus: 'question',
    movement: 'naming',
    tone: 'ardent',
    rewrite_hint: 'question-forms-living-knot',
  },
};

const GENERIC_GUARDIAN_PATTERNS = [
  /\bacceptable\b/i,
  /\bsans signal de danger\b/i,
  /\baucun signal de danger\b/i,
  /\bn apporte pas de sens\b/i,
  /\bmanque de sens\b/i,
  /\bvalid\w*\b/i,
  /\bok\b/i,
  /\bpeut etre accepte\b/i,
  /\best recevable\b/i,
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

function composeGuardianComment(echo: string, subcomment: string): string {
  const a = normalizeWhitespace(echo);
  const b = normalizeWhitespace(subcomment);
  if (!a && !b) return '';
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

export function extractGuidanceParts(input?: string | null): {
  echo: string;
  subcomment: string;
} {
  const clean = String(input ?? '').trim();
  if (!clean) return { echo: '', subcomment: '' };

  const parts = clean
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { echo: parts[0] ?? clean, subcomment: '' };
  }

  return {
    echo: parts[0],
    subcomment: parts.slice(1).join(' '),
  };
}

function normalizeConfidence(value: unknown, fallback = 0.86): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeGuardianFocus(
  value: unknown,
  fallback: GuardianSymbolicFocus,
): GuardianSymbolicFocus {
  switch (
    String(value ?? '')
      .trim()
      .toLowerCase()
  ) {
    case 'threshold':
      return 'threshold';
    case 'climate':
      return 'climate';
    case 'burden':
      return 'burden';
    case 'fracture':
      return 'fracture';
    case 'desire':
      return 'desire';
    case 'renunciation':
      return 'renunciation';
    case 'circle':
      return 'circle';
    case 'return':
      return 'return';
    case 'form':
      return 'form';
    case 'question':
      return 'question';
    default:
      return fallback;
  }
}

function normalizeGuardianMovement(
  value: unknown,
  fallback: GuardianMovement,
): GuardianMovement {
  switch (
    String(value ?? '')
      .trim()
      .toLowerCase()
  ) {
    case 'opening':
      return 'opening';
    case 'deepening':
      return 'deepening';
    case 'clarifying':
      return 'clarifying';
    case 'crossing':
      return 'crossing';
    case 'naming':
      return 'naming';
    case 'orienting':
      return 'orienting';
    case 'releasing':
      return 'releasing';
    case 'holding':
      return 'holding';
    case 'receiving':
      return 'receiving';
    default:
      return fallback;
  }
}

function normalizeGuardianTone(
  value: unknown,
  fallback: GuardianTone,
): GuardianTone {
  switch (
    String(value ?? '')
      .trim()
      .toLowerCase()
  ) {
    case 'calm':
      return 'calm';
    case 'grave':
      return 'grave';
    case 'ardent':
      return 'ardent';
    case 'clear':
      return 'clear';
    default:
      return fallback;
  }
}

function defaultGuardianConfig(step: string) {
  return (
    GUARDIAN_STEP_DEFAULTS[step] ?? {
      symbolic_focus: 'unknown' as GuardianSymbolicFocus,
      movement: 'opening' as GuardianMovement,
      tone: 'calm' as GuardianTone,
      rewrite_hint: 'generic-threshold-guidance',
    }
  );
}

function looksGuardianGeneric(comment: string): boolean {
  const clean = normalizeWhitespace(comment);
  if (!clean) return true;

  const ascii = stripDiacritics(clean.toLowerCase());
  if (clean.length < 28) return true;

  return GENERIC_GUARDIAN_PATTERNS.some((pattern) => pattern.test(ascii));
}

function sanitizeGuardianOutputPart(text: string): string {
  return normalizeWhitespace(text)
    .replace(/\bacceptable\b/gi, 'recevable')
    .replace(/\bsans signal de danger\b/gi, 'sans obstacle immédiat')
    .replace(/\baucun signal de danger\b/gi, 'sans obstacle immédiat')
    .replace(/\bvalid\w*\b/gi, 'mettre à l’épreuve')
    .replace(/\bok\b/gi, 'admis')
    .replace(
      /\bn apporte pas de sens\b/gi,
      'demande encore une forme plus vive',
    )
    .replace(/\bnom ou prenom simple\b/gi, 'nom premier');
}

function buildUnsafeGuardianEcho(step: string, value: string): string {
  const clean = normalizeWhitespace(value);
  switch (step) {
    case 'name':
      return `${quoted(clean, 'ce nom')} peut entrer dans le rite, mais demande une présence un peu plus incarnée.`;
    case 'question':
      return 'La question touche quelque chose, mais sa pointe doit être encore resserrée.';
    default:
      return 'Le seuil reste ouvert, mais cette étape demande encore une formulation plus juste.';
  }
}

function buildUnsafeGuardianSubcomment(
  step: string,
  _value: string,
  movement: GuardianMovement,
): string {
  switch (step) {
    case 'name':
      return `Il ne s’agit pas d’ajouter beaucoup, seulement de donner au nom une chair plus sensible pour que le passage gagne en netteté et en ${movement === 'clarifying' ? 'éclaircissement' : 'justesse'}.`;
    case 'question':
      return 'Le rite recevra mieux une question moins diffuse, plus tendue entre ce qui manque et ce qui appelle.';
    default:
      return 'Une reformulation simple, plus concrète ou plus tendue, suffira pour redonner au passage sa forme exacte.';
  }
}

function buildGuardianEcho(
  step: string,
  value: string,
  isSafe: boolean,
  symbolicFocus: GuardianSymbolicFocus,
  movement: GuardianMovement,
  tone: GuardianTone,
): string {
  if (!isSafe) return buildUnsafeGuardianEcho(step, value);

  const clean = normalizeWhitespace(value);
  const toneWord =
    tone === 'grave'
      ? 'grave'
      : tone === 'ardent'
        ? 'ardente'
        : tone === 'clear'
          ? 'claire'
          : 'sobre';

  switch (step) {
    case 'name':
      return `${quoted(clean, 'ce nom')} ouvre un seuil ${toneWord} ; tu peux entrer sans te justifier.`;
    case 'mood':
      return `Sous le signe de ${quoted(clean, 'cette humeur')}, le rite reçoit déjà son climat intérieur.`;
    case 'format':
      return `${quoted(clean, 'cette forme')} peut désormais porter la manière dont la vérité va frapper.`;
    case 'question':
      return `Dans ${quoted(clean, 'cette question')}, on entend déjà un nœud vivant capable d’appeler l’oracle.`;
    case 'weight':
      return `En nommant ${quoted(clean, 'ce poids')}, tu donnes au rite une gravité qu’il peut réellement traverser.`;
    case 'fear':
      return `La peur dite, ${quoted(clean, 'cette peur')}, cesse d’être une brume et devient un bord visible.`;
    case 'desire':
      return `Ton désir, ${quoted(clean, 'ce désir')}, trace déjà une direction plus haute que le simple manque.`;
    case 'sacrifice':
      return `Ce que tu consens à quitter, ${quoted(clean, 'ce sacrifice')}, ouvre un passage réel dans le rite.`;
    case 'social':
      return `La place que tu nommes parmi les autres donne déjà au cercle une figure lisible.`;
    case 'eternity':
      return `Cette parole ouvre un horizon de retour ; elle donne au rite une durée intérieure.`;
    default:
      return `Cette parole trouve un ${symbolicFocus === 'unknown' ? 'seuil' : symbolicFocus} et peut poursuivre son ${movement}.`;
  }
}

function buildGuardianSubcomment(
  step: string,
  value: string,
  isSafe: boolean,
  symbolicFocus: GuardianSymbolicFocus,
  movement: GuardianMovement,
  tone: GuardianTone,
): string {
  if (!isSafe) {
    return buildUnsafeGuardianSubcomment(step, value, movement);
  }

  const movementNoun =
    movement === 'opening'
      ? 'ouverture'
      : movement === 'deepening'
        ? 'approfondissement'
        : movement === 'clarifying'
          ? 'éclaircissement'
          : movement === 'crossing'
            ? 'franchissement'
            : movement === 'naming'
              ? 'nomination'
              : movement === 'orienting'
                ? 'orientation'
                : movement === 'releasing'
                  ? 'déliaison'
                  : movement === 'holding'
                    ? 'tenue'
                    : 'accueil';

  switch (step) {
    case 'name':
      return `Ici, le nom n’est pas une pièce à produire : il devient présence, apparition et premier passage, dans une ouverture claire du seuil.`;
    case 'mood':
      return `Cette humeur ne sert pas à classer l’âme ; elle règle la lumière intérieure de ce qui va se dire et donne au rite une qualité de climat immédiatement sensible.`;
    case 'format':
      return `La forme choisie ne décore pas la vérité : elle décide de sa coupe, de sa vitesse et de la manière dont elle pourra être reçue sans se disperser.`;
    case 'question':
      return `Une question n’a pas besoin d’être parfaite pour être digne ; il suffit qu’elle porte une tension juste entre manque, appel et pensée pour nourrir l’invocation.`;
    case 'weight':
      return `Le poids nommé retire au rite toute abstraction inutile : il lui donne une matière contre laquelle mesurer la traversée, la tenue et le possible dépassement.`;
    case 'fear':
      return `Quand la peur reçoit des mots, elle cesse de commander depuis l’ombre ; elle devient une ligne de fracture qu’on peut regarder sans détour et franchir avec plus de lucidité.`;
    case 'desire':
      return `Le désir formulé n’est pas seulement une envie ; il devient un axe d’orientation, une poussée de hauteur, quelque chose qui attire déjà l’interprétation hors de l’inertie.`;
    case 'sacrifice':
      return `Le sacrifice nommé donne au passage sa perte féconde : quelque chose devra tomber, non pour mutiler le vivant, mais pour lui rendre une force plus exacte.`;
    case 'social':
      return `Dire sa place parmi les autres donne au rite un cercle concret : proximité, retrait, guide, solitude ou partage cessent d’être flous et deviennent lisibles.`;
    case 'eternity':
      return `L’éternité n’est pas ici un grand mot abstrait ; elle devient la forme intérieure du retour, une manière d’éprouver ce qui pourrait revenir et ce qui mérite d’être recommencé.`;
    default:
      return `Le rite reçoit ici un ${symbolicFocus}, un mouvement d’${movementNoun} et une tonalité ${tone} ; cela suffit pour poursuivre sans retomber dans une approbation bureaucratique.`;
  }
}

export function buildGuardianGuidanceFromPayload(
  step: string,
  value: string,
  payload: GuardianPayloadLike = {},
): GuardianGuidance {
  const defaults = defaultGuardianConfig(step);
  const isSafe = Boolean(payload?.isSafe ?? payload?.is_safe ?? true);
  const confidence = normalizeConfidence(
    payload?.confidence,
    isSafe ? 0.9 : 0.74,
  );

  const rawComment = normalizeWhitespace(payload?.comment);
  const symbolic_focus = normalizeGuardianFocus(
    payload?.symbolic_focus,
    defaults.symbolic_focus,
  );
  const movement = normalizeGuardianMovement(
    payload?.movement,
    defaults.movement,
  );
  const tone = normalizeGuardianTone(payload?.tone, defaults.tone);

  const rewrite_hint =
    normalizeWhitespace(payload?.rewrite_hint) || defaults.rewrite_hint;

  const echo = sanitizeGuardianOutputPart(
    buildGuardianEcho(step, value, isSafe, symbolic_focus, movement, tone),
  );
  const subcomment = sanitizeGuardianOutputPart(
    buildGuardianSubcomment(
      step,
      value,
      isSafe,
      symbolic_focus,
      movement,
      tone,
    ),
  );

  const deterministicComment = composeGuardianComment(echo, subcomment);

  if (!rawComment || looksGuardianGeneric(rawComment)) {
    return {
      comment: deterministicComment,
      echo,
      subcomment,
      isSafe,
      confidence,
      symbolic_focus,
      movement,
      tone,
      rewrite_hint,
    };
  }

  return {
    comment: deterministicComment,
    echo,
    subcomment,
    isSafe,
    confidence,
    symbolic_focus,
    movement,
    tone,
    rewrite_hint,
  };
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
): Promise<GuardianGuidance> {
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const stepA = toAscii(step);
    const valueA = toAscii(value);
    const valueDisplay = normalizeWhitespace(value);

    const prompt = [
      'Tu es le Gardien du Seuil.',
      'Tu verifies une etape du rituel et tu aides l utilisateur a poursuivre.',
      'Reponds en JSON strict.',
      'Le contrat doit toujours contenir: comment, isSafe, confidence.',
      'Ajoute si possible: symbolic_focus, movement, tone, rewrite_hint.',
      'symbolic_focus ∈ threshold|climate|burden|fracture|desire|renunciation|circle|return|form|question.',
      'movement ∈ opening|deepening|clarifying|crossing|naming|orienting|releasing|holding|receiving.',
      'tone ∈ calm|grave|ardent|clear.',
      'comment = une seule phrase courte, specifique a l etape, attentive aux mots fournis, jamais bureaucratique.',
      'Si isSafe=true, la phrase doit ouvrir la suite en interpretant legerement le texte.',
      'INTERDIT: "acceptable", "sans signal de danger", "valide", "ok", "n apporte pas de sens", "simple".',
      'Pour un prenom simple, transforme-le en seuil symbolique sobre.',
      'FORMAT JSON STRICT OBLIGATOIRE:',
      '{"comment": string, "isSafe": boolean, "confidence": number, "symbolic_focus"?: string, "movement"?: string, "tone"?: string, "rewrite_hint"?: string}',
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
      return buildGuardianGuidanceFromPayload(stepA, valueDisplay, {
        isSafe: true,
      });
    }

    const rawComment =
      mode === 'guardian'
        ? String(payload?.comment ?? env?.text ?? '')
        : mode === 'oracle'
          ? String(payload?.interpretation ?? payload?.quote ?? env?.text ?? '')
          : String(payload?.comment ?? env?.text ?? '');

    const guidance = buildGuardianGuidanceFromPayload(stepA, valueDisplay, {
      ...(payload && typeof payload === 'object' ? payload : {}),
      comment: rawComment,
      isSafe: payload?.isSafe ?? payload?.is_safe ?? true,
    });

    if (guard.shouldRetry(rawComment)) {
      return buildGuardianGuidanceFromPayload(stepA, valueDisplay, {
        ...guidance,
        comment: '',
      });
    }

    return guidance;
  } catch (e) {
    logger.warn('Guardian error:', e);
    return buildGuardianGuidanceFromPayload(step, value, { isSafe: true });
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
