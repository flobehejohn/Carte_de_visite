import { useEffect, useState } from 'react';
import { useOracleContext } from '../../context/OracleContext';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge';
import { distributeSurfaces } from '../../domain/oracleText/surfacePolicy';
import { buildSemanticTypography } from '../../scene/contracts/semanticTypography';

export function OracleReadingPanel() {
  const ctx = useOracleContext() as any;
  const payload = ctx?.lastResult || ctx?.result || null;
  const [docDistribution, setDocDistribution] = useState<any>(null);
  const [mode, setMode] = useState<'reading' | 'immersion'>('reading');
  const [isMobile, setIsMobile] = useState(false);

  // PHASE 6 : Détection du Viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Au chargement, on passe le flag isMobile à l'usine de routage
  useEffect(() => {
    if (payload) {
      const semanticDoc = buildSemanticTypography(payload);
      setDocDistribution(distributeSurfaces(semanticDoc, isMobile));
    } else {
      setDocDistribution(null);
    }
  }, [payload, isMobile]);

  if (!docDistribution) return null;

  const htmlContent = docDistribution.htmlOverlay;
  const drawerContent = docDistribution.htmlDrawer;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-50 flex flex-col justify-end p-4 md:p-8 pb-12 transition-opacity duration-1000 ${mode === 'immersion' ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* HUD Controls */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 pointer-events-auto flex gap-4">
        <button
          onClick={() => setMode(mode === 'reading' ? 'immersion' : 'reading')}
          className="text-[10px] md:text-xs uppercase tracking-widest text-slate-400 hover:text-white transition-colors border border-slate-700 px-3 py-2 md:px-4 md:py-2 rounded bg-black/20 backdrop-blur-sm"
        >
          {mode === 'reading' ? 'Entrer en Immersion (3D)' : 'Mode Lecture'}
        </button>
      </div>

      {/* SAFE ZONE CAMERA : max-h-[45vh] sur mobile, 50vh sur Desktop pour ne jamais couvrir l'orbe */}
      <div className="max-w-2xl w-full text-slate-300 pointer-events-auto bg-black/40 backdrop-blur-md p-4 md:p-6 rounded-lg border border-slate-800/50 shadow-2xl max-h-[45vh] md:max-h-[50vh] overflow-y-auto">
        {/* PHASE 6 : Affichage dynamique de la citation si reléguée en HTML (Mobile) */}
        {htmlContent.quote?.content && (
          <h2 className="text-lg md:text-xl font-oracle text-white mb-4 italic leading-relaxed">
            "{htmlContent.quote.content as string}"
          </h2>
        )}

        {(htmlContent.central_tension?.content ||
          htmlContent.reversal?.content) && (
          <div className="mb-4 text-amber-500/80 text-xs md:text-sm font-semibold tracking-wider">
            {htmlContent.central_tension?.content}{' '}
            {htmlContent.reversal?.content}
          </div>
        )}

        {htmlContent.explanation_long?.content && (
          <p className="text-xs md:text-sm leading-relaxed mb-6">
            {htmlContent.explanation_long.content as string}
          </p>
        )}

        {drawerContent.citations?.content && (
          <div
            className="text-[10px] md:text-xs text-slate-500 flex items-center gap-2 cursor-pointer hover:text-white transition-colors"
            onMouseEnter={() =>
              oracleInteractionBridge.setFocus({
                target: 'citation',
                source: 'html',
              })
            }
            onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
          >
            <span className="w-4 h-[1px] bg-slate-500 block"></span>
            Sources d'entraînement :{' '}
            {(drawerContent.citations.content as string[]).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
