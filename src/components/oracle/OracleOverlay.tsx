import { useEffect, useState } from 'react';

export interface OraclePayload {
  chapter?: string;
  quote?: string;
  interpretation?: string;
  author?: string;
  keywords?: string[];
  composition?: {
    prose: string;
  };
  hermeneutic?: {
    chapter: string;
    quote: string;
  };
  [key: string]: unknown;
}

interface OracleOverlayProps {
  progress: number;
  payload: OraclePayload | null;
}

export function OracleOverlay({ progress, payload }: OracleOverlayProps) {
  const [showHud, setShowHud] = useState(false);

  // Retarde l'apparition du HUD HTML pour laisser la 3D et la Citation respirer au centre
  useEffect(() => {
    if (payload && (payload.chapter || payload.hermeneutic?.chapter)) {
      const t = setTimeout(() => setShowHud(true), 2500);
      return () => clearTimeout(t);
    }
  }, [payload]);

  if (!payload) return null;

  // Extraction intelligente (Agnostique Legacy / Governed)
  const interpretationText =
    payload.composition?.prose ||
    payload.interpretation ||
    'Analyse en cours... La matrice réagit.';
  const chapterText =
    payload.hermeneutic?.chapter || payload.chapter || 'Analyse Systémique';
  const authorText = payload.author || "L'ORACLE";
  const keywordsList = payload.keywords || [];

  return (
    <div
      className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-between p-6 md:p-16"
      data-testid="oracle-overlay"
    >
      {/* --- EN TÊTE : Mots-clés (Système) --- */}
      <div
        className="flex justify-between items-start w-full transition-opacity duration-1000"
        style={{ opacity: showHud ? 1 : 0 }}
      >
        <div className="flex gap-3">
          {keywordsList.map((k: string) => (
            <span
              key={k}
              className="px-3 py-1 border border-cyan-500/30 text-[10px] uppercase tracking-widest text-cyan-200 bg-cyan-900/20 backdrop-blur-md rounded-full shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            >
              {k}
            </span>
          ))}
        </div>
        <div className="text-right text-[10px] font-mono text-cyan-500/50 tracking-widest">
          SYS.NODE.SYNC
          <br />
          {authorText}
        </div>
      </div>

      {/* --- CŒUR : La Citation est en WebGL (OrbTextManager) --- */}

      {/* --- PIED : L'Interprétation (La Clarté) et le Bouton --- */}
      <div
        className="w-full max-w-2xl pointer-events-auto bg-[#020617]/60 backdrop-blur-2xl border-l-4 border-amber-500 p-8 rounded-r-2xl shadow-2xl transition-all duration-1000 transform"
        style={{
          opacity: showHud ? 1 : 0,
          transform: showHud ? 'translateY(0)' : 'translateY(20px)',
        }}
      >
        <p className="text-xs font-mono uppercase tracking-[0.35em] text-amber-500/80 mb-4">
          {chapterText}
        </p>

        <p className="text-base md:text-lg leading-relaxed text-slate-200 font-oracle font-light mb-8">
          {interpretationText}
        </p>

        <button
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-white/5 border border-white/20 text-white font-mono uppercase text-xs tracking-widest hover:bg-white hover:text-black transition-all"
        >
          Fermer le Cercle
        </button>
      </div>
    </div>
  );
}
