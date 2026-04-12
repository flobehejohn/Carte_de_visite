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

  const requestIdRef = useRef(0);

  // 1) RITUEL FINAL
  const drawFromRitual = useCallback(
    async (ritual: RitualInput, opts?: DrawOptions) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);
      setLastResult(null);

      try {
        const result = await consultOracle(ritual, opts);
        if (requestId !== requestIdRef.current) return;
        setLastResult(result);
      } catch (err: any) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Erreur silencieuse.');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [],
  );

  // 2) GARDIEN DU SEUIL
  const checkStep = useCallback(
    async (step: string, value: string): Promise<boolean> => {
      if (!value || value.trim().length === 0) return true;

      setGuidanceLoading(true);
      setLastGuidance(null);

      try {
        const result = await getStepGuidance(step, value);
        const msg = String(result.comment ?? '').trim();
        setLastGuidance(msg.length > 0 ? msg : 'Le seuil reste ouvert.');
        return Boolean(result.isSafe);
      } catch (e: any) {
        // Ne pas rester silencieux: on affiche un message minimal
        setLastGuidance('Le seuil reste ouvert.');
        return true;
      } finally {
        setGuidanceLoading(false);
      }
    },
    [],
  );

  // 3) NETTOYAGE MANUEL
  const clearGuidance = useCallback(() => {
    setLastGuidance(null);
  }, []);

  // 4) RESET TOTAL
  const reset = useCallback(() => {
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
