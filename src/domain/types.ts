// src/domain/types.ts

export type Humeur =
  | 'calme'
  | 'anxieux'
  | 'joyeux'
  | 'fatigué'
  | 'curieux'
  | 'perdu'
  | (string & {}); // permet d’étendre sans casser le typage

export type TirageFormat =
  | 'Conseil'
  | 'Miroir'
  | 'Question'
  | 'Oracle'
  | 'Marteau'
  | 'Miel'
  | 'Aigle';

export interface RitualInput {
  nameOrNickname: string;
  mood: Humeur;
  format: TirageFormat;
  questionText: string;

  // Curseurs / dimensions (optionnels : certains écrans ne les collectent pas)
  weight?: string;    // Le Poids
  fear?: string;      // La Peur
  desire?: string;    // Le Désir
  sacrifice?: string; // Le Sacrifice
  social?: string;    // Le Troupeau
  eternity?: string;  // L'Éternité
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
  hermeneutic?: {
    quote?: string;
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
