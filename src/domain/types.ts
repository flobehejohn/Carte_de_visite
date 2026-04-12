// src/domain/types.ts

export type Humeur =
  | 'calme'
  | 'anxieux'
  | 'joyeux'
  | 'fatigué'
  | 'curieux'
  | 'perdu'
  | (string & {});

export type TirageFormat =
  | 'Conseil'
  | 'Miroir'
  | 'Question'
  | 'Oracle'
  | 'Marteau'
  | 'Miel'
  | "L'Aigle"
  | 'Aigle';

export interface RitualInput {
  nameOrNickname: string;
  mood: Humeur;
  format: TirageFormat;
  questionText: string;

  weight?: string;
  fear?: string;
  desire?: string;
  sacrifice?: string;
  social?: string;
  eternity?: string;
}

// NOUVEAU : Modèle canonique final (Sprint 1.1)
export interface FinalRevealModel {
  quote: string;
  chapter: string;
  author: string;
  central_tension: string;
  reversal: string;
  imperative: string;
  return_axis: string;
  explanation_short: string;
  explanation_long: string;
  citations: string[];
  confidence: number;
  blocks: any[];
}

export interface OracleResult {
  sentence: {
    id: string;
    text: string;
    part_title: string;
    section_title: string;
  };
  quote: string;
  interpretation: string;
  keywords: string[];
  ritual: RitualInput;

  // NOUVEAU : Attachement du modèle canonique unique
  finalReveal?: FinalRevealModel;

  hermeneutic?: {
    quote?: string;
    chapter?: string;
    keywords?: string[];
    anchors?: Array<{
      citation_id: string;
      role: 'anchor' | 'tension' | 'turn';
      motif: string;
      claim: string;
    }>;
  } | null;
  composition?: {
    prose: string;
    motifs?: Array<{
      citation_id: string;
      role: 'anchor' | 'tension' | 'turn';
      motif: string;
      claim: string;
      part_title?: string;
      section_title?: string;
    }>;
  } | null;

  tone: { sentiment: number; intensity: number; mysticism?: number };
  themeScores?: any[];
  mainTheme: { themeId: string; score: number; label: string };

  visualParams?: any;
  textLength?: number;
  seed?: string;
}
