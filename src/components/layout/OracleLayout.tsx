import { useEffect, useState } from 'react';
import { useOracleContext } from '../../context/OracleContext';
import RitualWizard from '../oracle/RitualWizard';
import { OracleReadingPanel } from '../oracleText/OracleReadingPanel';

export default function OracleLayout() {
  const ctx = useOracleContext() as any;
  const payload = ctx?.lastResult || ctx?.result || null;
  const [overlayProgress, setOverlayProgress] = useState(0);

  // Moteur d'animation fluide
  useEffect(() => {
    if (payload) {
      let p = 0.8;
      const interval = setInterval(() => {
        p += 0.02;
        setOverlayProgress(p);
        if (p >= 1.0) clearInterval(interval);
      }, 30);
      return () => clearInterval(interval);
    } else {
      setOverlayProgress(0);
    }
  }, [payload]);

  return (
    <div className="relative w-full h-screen bg-[#04070d] overflow-hidden selection:bg-amber-500/30">
      {/* 1. L'ORCHESTRATEUR ORIGINAL */}
      <RitualWizard />

      {/* 2. LE RIDEAU DE FIN */}
      {payload && (
        <div
          className="absolute inset-0 z-[45] bg-[#020617]/80 backdrop-blur-2xl transition-opacity duration-[1500ms]"
          style={{ opacity: overlayProgress === 1.0 ? 1 : overlayProgress }}
        />
      )}

      {/* 3. PHASE 4 : Le panneau de lecture HTML intelligent */}
      <OracleReadingPanel />
    </div>
  );
}
