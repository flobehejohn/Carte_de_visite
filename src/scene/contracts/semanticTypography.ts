/**
 * GOUVERNANCE TYPOGRAPHIQUE (Phases 1 à 5)
 * Moteur d'Importance Textuelle, Résolveur de Directives et Statut Narratif.
 */

export type DramaturgicalWeight = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type SurfacePolicy =
  | '3d_world'
  | '3d_hud'
  | 'html_overlay'
  | 'html_drawer'
  | 'hidden'
  | 'hybrid';

// PHASE 5: Statuts Narratifs Stricts
export type DiegesisMode =
  | 'diegetic' // Appartient au monde visible (chapitre, mots-clés, runes, impératifs courts)
  | 'intradiegetic' // Voix de l'oracle, parle depuis l'intérieur du rite (citation héroïque, tension, retournement)
  | 'extradiegetic'; // Appareil critique, justifie et explique (explication longue, citations, notes, métadonnées)

export interface VisualDirectives {
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  contrast: 'lowest' | 'low' | 'medium' | 'high' | 'absolute';
  animation: 'none' | 'fade_in' | 'typewriter' | 'reveal_cinematic' | 'glitch';
  mobilePriority: 'hide' | 'scroll' | 'stack' | 'scale_down' | 'force_top';
  duration: 'instant' | 'normal' | 'prolonged' | 'persistent';
}

export interface TextBlock {
  content: string | string[] | number;
  weight: DramaturgicalWeight;
  surfacePolicy: SurfacePolicy;
  diegesisMode: DiegesisMode;
  directives: VisualDirectives;
  proofPriority: number;
}

export interface SemanticOracleDocument {
  system_alert: TextBlock;
  quote: TextBlock;
  imperative: TextBlock;
  opening_image: TextBlock;
  chapter: TextBlock;
  central_tension: TextBlock;
  reversal: TextBlock;
  explanation_long: TextBlock;
  explanation_short: TextBlock;
  keywords: TextBlock;
  return_axis: TextBlock;
  anchors: TextBlock;
  citations: TextBlock;
  confidence: TextBlock;
}

/**
 * Le Moteur d'Importance : Convertit un poids dramaturgique en ordres de rendu bruts.
 */
export function resolveDirectives(
  weight: DramaturgicalWeight,
): VisualDirectives {
  switch (weight) {
    case 'P0':
      return {
        size: 'xl',
        contrast: 'absolute',
        animation: 'glitch',
        mobilePriority: 'force_top',
        duration: 'persistent',
      };
    case 'P1':
      return {
        size: 'lg',
        contrast: 'high',
        animation: 'reveal_cinematic',
        mobilePriority: 'scale_down',
        duration: 'prolonged',
      };
    case 'P2':
      return {
        size: 'md',
        contrast: 'medium',
        animation: 'typewriter',
        mobilePriority: 'stack',
        duration: 'normal',
      };
    case 'P3':
      return {
        size: 'sm',
        contrast: 'low',
        animation: 'fade_in',
        mobilePriority: 'hide',
        duration: 'normal',
      };
    case 'P4':
      return {
        size: 'xs',
        contrast: 'lowest',
        animation: 'none',
        mobilePriority: 'hide',
        duration: 'instant',
      };
  }
}

/**
 * Extrait une chaîne de caractères en toute sécurité depuis l'arbre JSON
 */
function extract(payload: any, paths: string[], fallback: string = ''): string {
  if (!payload) return fallback;
  for (const path of paths) {
    const keys = path.split('.');
    let value = payload;
    for (const key of keys) {
      value = value?.[key];
    }
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return fallback;
}

/**
 * Usine Canonique : Applique la Phase 5 (Statut narratif) au document Oracle
 */
export function buildSemanticTypography(payload: any): SemanticOracleDocument {
  const rawQuote = extract(
    payload,
    ['hermeneutic.quote', 'json.quote', 'quote'],
    'Le silence absolu.',
  );
  const rawChapter = extract(
    payload,
    ['hermeneutic.chapter', 'json.chapter', 'chapter'],
    'LE SEUIL',
  );
  const rawExplanation = extract(
    payload,
    ['composition.prose', 'json.interpretation', 'interpretation'],
    '...',
  );

  const rawKeywords = payload?.json?.keywords || payload?.keywords || [];
  const rawCitations =
    payload?.citationsUsed || payload?.json?.citationsUsed || [];
  const rawConfidence = payload?.json?.confidence || 0.99;

  // Détection d'erreurs Fail-Closed (P0)
  const isSystemError =
    payload?.error || payload?.rawJsonError || payload?.finalJsonError;
  const sysAlertContent = isSystemError ? String(isSystemError) : '';

  return {
    system_alert: {
      content: sysAlertContent,
      weight: 'P0',
      surfacePolicy: isSystemError ? 'hybrid' : 'hidden',
      diegesisMode: 'extradiegetic', // Meta-information système
      directives: resolveDirectives('P0'),
      proofPriority: 1,
    },
    quote: {
      content: rawQuote,
      weight: 'P1',
      surfacePolicy: '3d_world',
      diegesisMode: 'intradiegetic', // Voix de l'oracle
      directives: resolveDirectives('P1'),
      proofPriority: 1,
    },
    imperative: {
      content: extract(payload, ['composition.imperative'], 'Avance.'),
      weight: 'P1',
      surfacePolicy: '3d_hud',
      diegesisMode: 'diegetic', // Injonction courte, textuellement visible
      directives: resolveDirectives('P1'),
      proofPriority: 1,
    },
    opening_image: {
      content: extract(payload, ['composition.opening_image'], ''),
      weight: 'P1',
      surfacePolicy: '3d_hud',
      diegesisMode: 'intradiegetic',
      directives: resolveDirectives('P1'),
      proofPriority: 2,
    },
    chapter: {
      content: rawChapter,
      weight: 'P2',
      surfacePolicy: '3d_hud',
      diegesisMode: 'diegetic', // Le chapitre appartient au monde visible
      directives: resolveDirectives('P2'),
      proofPriority: 1,
    },
    central_tension: {
      content: extract(payload, ['composition.central_tension'], ''),
      weight: 'P2',
      surfacePolicy: 'html_overlay',
      diegesisMode: 'intradiegetic', // Tension narrative portée par la voix
      directives: resolveDirectives('P2'),
      proofPriority: 2,
    },
    reversal: {
      content: extract(payload, ['composition.reversal'], ''),
      weight: 'P2',
      surfacePolicy: 'html_overlay',
      diegesisMode: 'intradiegetic', // Retournement narratif
      directives: resolveDirectives('P2'),
      proofPriority: 2,
    },
    explanation_long: {
      content: rawExplanation,
      weight: 'P3',
      surfacePolicy: 'html_overlay',
      diegesisMode: 'extradiegetic', // Appareil critique
      directives: resolveDirectives('P3'),
      proofPriority: 2,
    },
    explanation_short: {
      content: rawExplanation.substring(0, 100) + '...',
      weight: 'P3',
      surfacePolicy: 'html_overlay',
      diegesisMode: 'extradiegetic', // Appareil critique
      directives: resolveDirectives('P3'),
      proofPriority: 3,
    },
    keywords: {
      content: rawKeywords,
      weight: 'P3',
      surfacePolicy: '3d_world',
      diegesisMode: 'diegetic', // Flotte dans la scène
      directives: resolveDirectives('P3'),
      proofPriority: 3,
    },
    return_axis: {
      content: extract(payload, ['composition.return_axis'], ''),
      weight: 'P3',
      surfacePolicy: 'html_overlay',
      diegesisMode: 'extradiegetic', // Aide utilisateur
      directives: resolveDirectives('P3'),
      proofPriority: 3,
    },
    anchors: {
      content: payload?.anchors || [],
      weight: 'P4',
      surfacePolicy: 'hidden',
      diegesisMode: 'extradiegetic', // Notes/Metadata
      directives: resolveDirectives('P4'),
      proofPriority: 4,
    },
    citations: {
      content: rawCitations,
      weight: 'P4',
      surfacePolicy: 'html_drawer',
      diegesisMode: 'extradiegetic', // Citations détaillées
      directives: resolveDirectives('P4'),
      proofPriority: 2,
    },
    confidence: {
      content: rawConfidence,
      weight: 'P4',
      surfacePolicy: 'html_drawer',
      diegesisMode: 'extradiegetic', // Métadonnée
      directives: resolveDirectives('P4'),
      proofPriority: 4,
    },
  };
}
