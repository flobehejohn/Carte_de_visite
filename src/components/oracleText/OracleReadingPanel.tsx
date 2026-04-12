import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useOracleContext } from '../../context/OracleContext';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge';

export function OracleReadingPanel() {
  const { lastResult, reset } = useOracleContext();
  const [mode, setMode] = useState<'reading' | 'immersion'>('reading');

  // Reset le mode de vue à chaque nouveau tirage ou reset global
  useEffect(() => {
    setMode('reading');
  }, [lastResult]);

  if (!lastResult || !lastResult.finalReveal) return null;

  const reveal = lastResult.finalReveal;

  return (
    <AnimatePresence mode="wait">
      {/* Container principal recouvrant tout l'écran */}
      <motion.div
        key="oracle-reading-panel"
        data-testid="reveal-panel"
        role="region"
        aria-label="Révélation finale de l'Oracle"
        initial={{ opacity: 0 }}
        animate={{ opacity: mode === 'immersion' ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
        className={`absolute inset-0 z-50 flex items-center justify-center p-4 sm:p-8 ${
          mode === 'immersion' ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
      >
        {/* Bouton pour repasser en mode lecture si on est en immersion (toujours cliquable) */}
        {mode === 'immersion' && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setMode('reading')}
            className="absolute top-8 right-8 pointer-events-auto px-4 py-2 border border-amber-500/50 text-amber-200 bg-black/60 backdrop-blur-md rounded text-xs uppercase tracking-widest hover:bg-amber-500 hover:text-black transition-colors"
          >
            Retour à la lecture
          </motion.button>
        )}

        {/* Panneau de lecture central */}
        <motion.div
          layout
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          className="w-full max-w-4xl bg-[#04070d]/85 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[90vh] custom-scrollbar relative flex flex-col"
        >
          {/* Header : Actions & Chapitre */}
          <div className="flex justify-between items-start p-6 md:px-10 md:pt-10 border-b border-white/5">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] md:text-xs text-amber-500/60 font-mono uppercase tracking-[0.3em]">
                {reveal.chapter || 'Révélation'}
              </span>
              <span className="text-xs text-white/40 italic font-serif">
                Par {reveal.author || 'Zarathoustra'}
              </span>
            </div>

            <button
              onClick={() => setMode('immersion')}
              className="text-[10px] md:text-xs uppercase tracking-widest text-amber-100/70 hover:text-white transition-colors px-3 py-1.5 border border-transparent hover:border-white/20 rounded"
            >
              Mode Immersion 3D
            </button>
          </div>

          {/* Corps de la lecture */}
          <div className="p-6 md:p-10 flex-grow flex flex-col gap-6">
            {/* Citation Principale (Héroïque) */}
            {reveal.quote && (
              <motion.h2
                data-testid="reveal-quote"
                className="text-2xl md:text-4xl font-serif text-white italic leading-snug border-l-4 border-amber-500 pl-6 drop-shadow-md"
              >
                « {reveal.quote} »
              </motion.h2>
            )}

            {/* Tensions et Retournement */}
            {(reveal.central_tension || reveal.reversal) && (
              <div className="flex flex-col gap-2 mt-4 text-amber-400/90 font-mono text-xs md:text-sm uppercase tracking-wide">
                {reveal.central_tension && (
                  <p>Tension : {reveal.central_tension}</p>
                )}
                {reveal.reversal && (
                  <p className="text-amber-200">
                    Retournement : {reveal.reversal}
                  </p>
                )}
              </div>
            )}

            {/* Explication / Prose */}
            {reveal.explanation_long && (
              <motion.div
                data-testid="reveal-prose"
                className="mt-2 text-slate-300 text-sm md:text-base leading-relaxed font-light space-y-4"
              >
                {reveal.explanation_long.split('\n').map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </motion.div>
            )}
          </div>

          {/* Footer : Sources et Reset */}
          <div className="p-6 md:px-10 md:pb-10 mt-auto border-t border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            {/* Rail de Sources */}
            <div
              data-testid="reveal-sources"
              className="flex items-center gap-3 cursor-pointer group"
              onMouseEnter={() =>
                oracleInteractionBridge.setFocus({
                  target: 'citation',
                  source: 'html',
                })
              }
              onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
            >
              <span className="w-6 h-[1px] bg-slate-600 group-hover:bg-amber-500 transition-colors block"></span>
              <span className="text-[10px] md:text-xs uppercase tracking-widest font-semibold text-slate-500 group-hover:text-amber-200 transition-colors">
                Sources :
              </span>
              <span className="text-xs font-mono text-slate-400">
                {reveal.citations.length > 0
                  ? reveal.citations.join(' • ')
                  : 'Sagesse pure'}
              </span>
            </div>

            {/* Bouton de Redémarrage (Le lien avec le Sprint 2.1) */}
            <button
              data-testid="btn-restart"
              onClick={() => {
                if (reset) reset();
              }}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-500 text-black font-semibold uppercase tracking-widest text-xs rounded transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.6)]"
            >
              Fermer le Cercle
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
