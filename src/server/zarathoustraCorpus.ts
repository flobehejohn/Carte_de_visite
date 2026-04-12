import type { Citation } from './contracts/oracleContracts.js';
import { retrieveZaraCitations } from './retriever/zarathoustraRetriever.js';

const OUT_OF_CORPUS_RE =
  /(wikipedia|wiki|google|web|internet|browser|source|sources|reference|refs|liens?|links?)/i;

export type ZarathoustraContext = {
  citations: Citation[];
  outOfCorpus: boolean;
  policy: 'OK' | 'HORS_CORPUS';
};

export function isOutOfCorpusRequest(input: string): boolean {
  return OUT_OF_CORPUS_RE.test(String(input ?? ''));
}

export function buildZarathoustraContext(
  query: string,
  opts?: { k?: number; traceId?: string },
): ZarathoustraContext {
  const outOfCorpus = isOutOfCorpusRequest(query);
  const citations = retrieveZaraCitations(query, { k: opts?.k ?? 6, traceId: opts?.traceId });
  return {
    citations,
    outOfCorpus,
    policy: outOfCorpus ? 'HORS_CORPUS' : 'OK',
  };
}
