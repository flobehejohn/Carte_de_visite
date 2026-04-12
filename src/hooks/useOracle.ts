import { useCallback, useRef, useState } from 'react';
import type { OracleResult, RitualInput } from '../domain/types';
import type { ClimateSnapshot } from '../services/zarathustraService';
import { consultOracle, getStepGuidance } from '../services/zarathustraService';

type DrawOptions = {
  climateSnapshot?: ClimateSnapshot | null;
  debug?: boolean;
};

export function useOracle() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OracleResult | null>(null);

  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [lastGuidance, setLastGuidance] = useState<string | null>(null);

  // FIX Phase 8 : 2 compteurs distincts pour invalider les requêtes en vol
  const oracleRequestIdRef = useRef(0);
  const guidanceRequestIdRef = useRef(0);

  // 1) RITUEL FINAL
  const drawFromRitual = useCallback(
    async (ritual: RitualInput, opts?: DrawOptions) => {
      const requestId = ++oracleRequestIdRef.current;
      setLoading(true);
      setError(null);
      setLastResult(null);

      try {
        const result = await consultOracle(ritual, opts);
        if (requestId !== oracleRequestIdRef.current) return; // Requête obsolète, on jette !
        setLastResult(result);
      } catch (err: any) {
        if (requestId !== oracleRequestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Erreur silencieuse.');
      } finally {
        if (requestId === oracleRequestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  // 2) GARDIEN DU SEUIL
  const checkStep = useCallback(
    async (step: string, value: string): Promise<boolean> => {
      if (!value || value.trim().length === 0) return true;

      const requestId = ++guidanceRequestIdRef.current;
      setGuidanceLoading(true);
      setLastGuidance(null);

      try {
        const result = await getStepGuidance(step, value);
        if (requestId !== guidanceRequestIdRef.current) return true; // On ne bloque pas si obsolète
        const msg = String(result.comment ?? '').trim();
        setLastGuidance(msg.length > 0 ? msg : 'Le seuil reste ouvert.');
        return Boolean(result.isSafe);
      } catch (e: any) {
        if (requestId !== guidanceRequestIdRef.current) return true;
        setLastGuidance('Le seuil reste ouvert.');
        return true;
      } finally {
        if (requestId === guidanceRequestIdRef.current)
          setGuidanceLoading(false);
      }
    },
    [],
  );

  // 3) NETTOYAGE MANUEL
  const clearGuidance = useCallback(() => {
    guidanceRequestIdRef.current += 1; // Tue toute guidance en vol
    setLastGuidance(null);
    setGuidanceLoading(false);
  }, []);

  // 4) RESET TOTAL IMPLACABLE (Sprint 2.1)
  const reset = useCallback(() => {
    oracleRequestIdRef.current += 1; // Tue toute requête oracle en vol
    guidanceRequestIdRef.current += 1; // Tue toute guidance en vol

    setLastResult(null);
    setLastGuidance(null);
    setError(null);
    setLoading(false);
    setGuidanceLoading(false);
  }, []);

  return {
    loading,
    error,
    lastResult,
    drawFromRitual,
    checkStep,
    guidanceLoading,
    lastGuidance,
    clearGuidance,
    reset,
  };
}
