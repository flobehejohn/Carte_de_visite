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

export type GuardianGuidanceBlock = {
  echo: string;
  subcomment: string;
  unsafeHint?: string | null;
};

export type GuardianPayloadLike = {
  comment?: unknown;
  isSafe?: unknown;
  is_safe?: unknown;
  confidence?: unknown;
  symbolic_focus?: unknown;
  movement?: unknown;
  tone?: unknown;
  rewrite_hint?: unknown;
};

type GuardianStepDefaults = {
  symbolic_focus: GuardianSymbolicFocus;
  movement: GuardianMovement;
  tone: GuardianTone;
  rewrite_hint: string;
};

const GUARDIAN_STEP_ALIASES: Record<string, string> = {
  identity: 'name',
  nameornickname: 'name',
  atmosphere: 'mood',
  climate: 'mood',
  questiontext: 'question',
  socialrole: 'social',
};

const GUARDIAN_STEP_DEFAULTS: Record<string, GuardianStepDefaults> = {
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

function normalizeWhitespace(input: unknown): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(input: string, max = 84): string {
  const clean = normalizeWhitespace(input);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function quoted(value: string, fallback = 'cette parole'): string {
  const clean = clip(value, 72);
  return clean ? `« ${clean} »` : fallback;
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

export function normalizeGuardianStepKey(step: string): string {
  const normalized = normalizeWhitespace(step)
    .replace(/[_-]/g, '')
    .toLowerCase();

  return GUARDIAN_STEP_ALIASES[normalized] ?? normalized;
}

export function getGuardianStepDefaults(step: string): GuardianStepDefaults {
  return (
    GUARDIAN_STEP_DEFAULTS[normalizeGuardianStepKey(step)] ?? {
      symbolic_focus: 'unknown',
      movement: 'opening',
      tone: 'calm',
      rewrite_hint: 'generic-threshold-guidance',
    }
  );
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

function buildUnsafeGuardianEcho(step: string, value: string): string {
  const clean = normalizeWhitespace(value);

  switch (normalizeGuardianStepKey(step)) {
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
  movement: GuardianMovement,
): string {
  switch (normalizeGuardianStepKey(step)) {
    case 'name':
      return `Il ne s’agit pas d’ajouter beaucoup, seulement de donner au nom une chair plus sensible pour que le passage gagne en netteté et en ${movement === 'clarifying' ? 'éclaircissement' : 'justesse'}.`;
    case 'question':
      return 'Le rite recevra mieux une question moins diffuse, plus tendue entre ce qui manque et ce qui appelle.';
    default:
      return 'Une reformulation simple, plus concrète ou plus tendue, suffira pour redonner au passage sa forme exacte.';
  }
}

function buildUnsafeGuardianHint(step: string): string {
  switch (normalizeGuardianStepKey(step)) {
    case 'name':
      return 'Ajoute au nom un signe plus sensible : un poids, un appel ou une tonalité vécue.';
    case 'question':
      return 'Resserre la question autour d’un manque plus net ou d’un passage plus vif.';
    default:
      return 'Reprends cette étape avec une image plus concrète ou une tension plus précise.';
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
  const canonicalStep = normalizeGuardianStepKey(step);
  if (!isSafe) return buildUnsafeGuardianEcho(canonicalStep, value);

  const clean = normalizeWhitespace(value);
  const toneWord =
    tone === 'grave'
      ? 'grave'
      : tone === 'ardent'
        ? 'ardente'
        : tone === 'clear'
          ? 'claire'
          : 'sobre';

  switch (canonicalStep) {
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
  isSafe: boolean,
  symbolicFocus: GuardianSymbolicFocus,
  movement: GuardianMovement,
  tone: GuardianTone,
): string {
  const canonicalStep = normalizeGuardianStepKey(step);
  if (!isSafe) {
    return buildUnsafeGuardianSubcomment(canonicalStep, movement);
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

  switch (canonicalStep) {
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

export function composeGuardianGuidanceFromPayload(
  step: string,
  value: string,
  payload: GuardianPayloadLike = {},
): GuardianGuidanceBlock {
  const defaults = getGuardianStepDefaults(step);
  const isSafe = Boolean(payload?.isSafe ?? payload?.is_safe ?? true);
  const symbolicFocus = normalizeGuardianFocus(
    payload?.symbolic_focus,
    defaults.symbolic_focus,
  );
  const movement = normalizeGuardianMovement(
    payload?.movement,
    defaults.movement,
  );
  const tone = normalizeGuardianTone(payload?.tone, defaults.tone);

  const echo = sanitizeGuardianOutputPart(
    buildGuardianEcho(step, value, isSafe, symbolicFocus, movement, tone),
  );
  const subcomment = sanitizeGuardianOutputPart(
    buildGuardianSubcomment(step, isSafe, symbolicFocus, movement, tone),
  );

  if (isSafe) {
    return {
      echo,
      subcomment,
    };
  }

  return {
    echo,
    subcomment,
    unsafeHint: sanitizeGuardianOutputPart(buildUnsafeGuardianHint(step)),
  };
}
