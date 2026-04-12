import type { Citation } from './contracts/oracle.types.js';
import { isOutOfCorpusRequest, retrieveZaraCitations } from './retriever/zarathoustraRetriever.js';

export type ZarathoustraContext = {
  citations: Citation[];
  outOfCorpus: boolean;
  policy: 'OK' | 'HORS_CORPUS';
};

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
