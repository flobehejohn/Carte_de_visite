import { getZaraCorpus } from './corpus.js';
import { RETRIEVER_VERSION } from './retriever.js';

export type KnowledgeHealth = {
  corpusLoaded: boolean;
  corpusSize: number;
  corpusHash?: string;
  retrieverVersion: string;
  integrityMode?: string;
};

export function getKnowledgeHealth(): KnowledgeHealth {
  try {
    const corpus = getZaraCorpus();
    return {
      corpusLoaded: true,
      corpusSize: corpus.sentences.length,
      corpusHash: corpus.corpusHash,
      retrieverVersion: RETRIEVER_VERSION,
      integrityMode: corpus.integrityMode,
    };
  } catch {
    return {
      corpusLoaded: false,
      corpusSize: 0,
      retrieverVersion: RETRIEVER_VERSION,
      integrityMode: 'none',
    };
  }
}
