// src/domain/oracleText/finalRevealModel.ts
import { FinalRevealModel } from '../types';

/**
 * Mappe le payload brut du backend vers le modèle canonique unique de la Révélation Finale.
 * Garantit la présence des champs métiers et unifie les chemins JSON divergents.
 */
export function mapToFinalRevealModel(rawPayload: any): FinalRevealModel {
  if (!rawPayload) return createEmptyReveal();

  // On gère les différents wrappings possibles du backend ou de la route Mock Playwright
  const data = rawPayload.json || rawPayload.hermeneutic || rawPayload;

  const citationsSource = Array.isArray(data.citations)
    ? data.citations
    : Array.isArray(data.citationsUsed)
      ? data.citationsUsed
      : [];

  return {
    quote: data.quote || '',
    chapter: data.chapter || 'RÉVÉLATION',
    author: data.author || 'Zarathoustra',
    central_tension: data.central_tension || '',
    reversal: data.reversal || '',
    imperative: data.imperative || '',
    return_axis: data.return_axis || '',
    explanation_short: data.explanation_short || '',
    explanation_long: data.explanation_long || data.prose || '',
    citations: citationsSource,
    confidence: typeof data.confidence === 'number' ? data.confidence : 1.0,
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
  };
}

function createEmptyReveal(): FinalRevealModel {
  return {
    quote: '',
    chapter: 'RÉVÉLATION',
    author: 'Zarathoustra',
    central_tension: '',
    reversal: '',
    imperative: '',
    return_axis: '',
    explanation_short: '',
    explanation_long: '',
    citations: [],
    confidence: 1.0,
    blocks: [],
  };
}
