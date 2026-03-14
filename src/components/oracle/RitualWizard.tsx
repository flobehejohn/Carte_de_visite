// src/components/oracle/RitualWizard.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { useOracle } from '../../hooks/useOracle';
import { Oracle3DScene } from './Oracle3DScene';

const Oracle3DSceneMemo = memo(Oracle3DScene);

// --- TYPEWRITER COMPONENT ---
const Typewriter = ({
  text,
  speed = 20,
  onComplete,
}: {
  text: string;
  speed?: number;
  onComplete?: () => void;
}) => {
  const [charIndex, setCharIndex] = useState(0);
  const completionRef = useRef(false);

  useEffect(() => {
    setCharIndex(0);
    completionRef.current = false;
    if (!text) return;
    const interval = window.setInterval(() => {
      setCharIndex((prev) => (prev < text.length ? prev + 1 : prev));
    }, speed);
    return () => window.clearInterval(interval);
  }, [text, speed]);

  useEffect(() => {
    if (text && charIndex >= text.length && !completionRef.current) {
      completionRef.current = true;
      onComplete?.();
    }
  }, [charIndex, text, onComplete]);

  return (
    <span>
      {text?.slice(0, charIndex)}
      <span className="cursor-blink">|</span>
    </span>
  );
};

// --- DATA CONSTANTS ---
const STEPS = [
  {
    id: 'name',
    label: 'I. Identité',
    q: 'Qui ose éveiller Zarathoustra ?',
    placeholder: 'Ton nom...',
  },
  {
    id: 'mood',
    label: 'II. Atmosphère',
    q: 'Quel ciel pèse sur ton âme ?',
    type: 'cards',
  },
  {
    id: 'weight',
    label: 'III. Le Fardeau',
    q: 'Quelle pierre est la plus lourde ?',
    type: 'cards',
  },
  {
    id: 'fear',
    label: "IV. L'Entrave",
    q: "Qu'est-ce qui te fait trembler ?",
    placeholder: 'Ma peur est...',
  },
  {
    id: 'desire',
    label: 'V. Le Désir',
    q: 'Vers quelle étoile tends-tu ?',
    type: 'cards',
  },
  {
    id: 'sacrifice',
    label: 'VI. Le Combat',
    q: 'Que dois-tu sacrifier ?',
    type: 'cards',
  },
  {
    id: 'social',
    label: 'VII. Le Troupeau',
    q: 'Où te tiens-tu parmi les autres ?',
    type: 'cards',
  },
  {
    id: 'eternity',
    label: "VIII. L'Éternité",
    q: 'Si cet instant se répétait...',
    type: 'cards',
  },
  {
    id: 'format',
    label: 'IX. Le Réceptacle',
    q: 'Quelle forme pour la vérité ?',
    type: 'formats',
  },
  {
    id: 'question',
    label: 'X. Invocation',
    q: "Parle maintenant à l'Abîme.",
    placeholder: 'Ta question...',
  },
];

const MOODS = [
  'Orageux',
  'Brumeux',
  'Zénith',
  'Crépuscule',
  'Aurore',
  'Nuit Noire',
];
const WEIGHTS = [
  'Le Regret',
  'Le Devoir',
  'La Solitude',
  'La Culpabilité',
  "L'Ignorance",
  "L'Ennui",
];
const DESIRES = [
  'La Puissance',
  'La Création',
  'La Paix',
  'La Vérité',
  "L'Amour",
  'La Gloire',
];
const SACRIFICES = [
  'Ma Paresse',
  'Mon Orgueil',
  'Ma Naïveté',
  'Ma Colère',
  'Ma Peur',
  'Mon Confort',
];
const SOCIALS = [
  'Le Guide',
  "L'Ermite",
  'Le Guerrier',
  'Le Compagnon',
  "L'Observateur",
];
const ETERNITIES = ['La Joie', "L'Effroi", "L'Indifférence", "L'Acceptation"];
const FORMATS = [
  { id: 'Le Marteau', label: 'Le Marteau', desc: 'Brutal' },
  { id: 'Le Miel', label: 'Le Miel', desc: 'Doux' },
  { id: "L'Aigle", label: "L'Aigle", desc: 'Haut' },
  { id: "L'Énigme", label: "L'Énigme", desc: 'Mystique' },
];

const INITIAL_FORM = {
  name: '',
  mood: '',
  weight: '',
  fear: '',
  desire: '',
  sacrifice: '',
  social: '',
  eternity: '',
  format: '',
  question: '',
};

export default function RitualWizard() {
  const {
    checkStep,
    error,
    guidanceLoading,
    lastGuidance,
    clearGuidance,
    drawFromRitual,
    loading,
    lastResult,
    reset,
  } = useOracle();

  const [stage, setStage] = useState<number>(1);
  const [formData, setFormData] = useState<any>(INITIAL_FORM);
  const [sceneData, setSceneData] = useState<any>(INITIAL_FORM);
  const [viewState, setViewState] = useState<'INPUT' | 'GUIDANCE'>('INPUT');
  const [canProceed, setCanProceed] = useState(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const currentStep = STEPS[stage - 1];
  const currentValue = currentStep ? formData[currentStep.id] || '' : '';
  const canValidate = Boolean(currentValue.trim().length > 0);

  const updateField = (fieldKey: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [fieldKey]: value }));
  };

  // --- HANDLERS ---
  const handleValidate = async () => {
    if (!currentStep || !canValidate) return;
    clearGuidance();
    setViewState('GUIDANCE');
    setCanProceed(false);
    setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));

    // ✅ FIX: step stable (id), pas le label
    await checkStep(currentStep.id, currentValue);
  };

  const handleNextStep = () => {
    clearGuidance();
    setCanProceed(false);
    if (stage < 10) {
      setStage((prev) => prev + 1);
      setViewState('INPUT');
    } else {
      handleFinalDraw();
    }
  };

  const handleFinalDraw = () => {
    setStage(11);
    setSceneData((prev: any) => ({ ...prev, ...formData }));
    const fallbackProgress = Math.max(0, Math.min(1, (stage - 1) / 9));
    const climateSnapshot = (() => {
      const fallback = {
        progress: fallbackProgress,
        mood: formData.mood || '',
      };
      try {
        const audit = (window as any).__ORB_AUDIT__;
        const snap = audit?.snapshot?.();
        if (!snap) return fallback;
        const targets = snap?.climateTargets;
        const palette = snap?.ritualGenome?.palette;
        const paletteMode = snap?.ritualGenome?.paletteMode;
        const primary = palette?.primary?.hex;
        const accent = palette?.accent?.hex;
        const progress =
          typeof snap?.progress === 'number' ? snap.progress : fallbackProgress;
        return {
          progress,
          mood: formData.mood || '',
          presetName: targets?.presetName,
          fog: targets?.fog,
          bloom: targets?.bloom,
          volume: targets?.volume,
          palette: { mode: paletteMode, primary, accent },
        };
      } catch {
        return fallback;
      }
    })();

    drawFromRitual(
      {
        ...formData,
        nameOrNickname: formData.name,
        questionText: formData.question,
      } as any,
      { climateSnapshot },
    );
  };

  const handleReset = () => {
    if (reset) reset();
    setStage(1);
    setFormData(INITIAL_FORM);
    setSceneData(INITIAL_FORM);
    setViewState('INPUT');
    setCanProceed(false);
    clearGuidance();
  };

  // Observe texte final pour adapter la scène 3D (layoutPressure)
  useEffect(() => {
    if (!textRef.current) return;
    if (resizeObserverRef.current) resizeObserverRef.current.disconnect();

    const computeMetrics = () => {
      const el = textRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth || 1;
      const vh = window.innerHeight || 1;
      const areaRatio = Math.max(
        0,
        Math.min(1, (rect.width * rect.height) / (vw * vh)),
      );
      const linesApprox = Math.max(1, Math.round(rect.height / 18));
      const metrics = {
        textLength:
          lastResult?.interpretation?.length ?? formData.question?.length ?? 0,
        boxW: rect.width,
        boxH: rect.height,
        linesApprox,
        areaRatio,
        viewportW: vw,
        viewportH: vh,
      };
      setSceneData((prev: any) => ({ ...prev, textMetrics: metrics }));
    };

    computeMetrics();
    const ro = new ResizeObserver(() => computeMetrics());
    resizeObserverRef.current = ro;
    ro.observe(textRef.current);
    window.addEventListener('resize', computeMetrics);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeMetrics);
    };
  }, [lastResult, formData.question]);

  useEffect(() => {
    if (!lastResult) return;
    const quoteLen = lastResult.quote?.length ?? 0;
    const interpLen = lastResult.interpretation?.length ?? 0;
    const textLength = quoteLen + interpLen;
    setSceneData((prev: any) => ({
      ...prev,
      visualParams: lastResult.visualParams,
      seed: lastResult.seed ?? lastResult.visualParams?.seed,
      textLength,
    }));
  }, [lastResult]);

  // --- RENDERERS ---
  const renderCards = (items: string[], fieldKey: string) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => updateField(fieldKey, item)}
          className={`
            p-3 text-sm rounded border transition-all duration-300 font-oracle backdrop-blur-md
            hover:bg-white/10 hover:text-white hover:border-white/40
            ${
              formData[fieldKey] === item
                ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                : 'bg-black/60 border-white/20 text-white/70'
            }
          `}
        >
          {item}
        </button>
      ))}
    </div>
  );

  return (
    <div className="orbital-container">
      <div className="zone-oracle-bg">
        <Oracle3DSceneMemo
          formData={sceneData}
          stage={stage}
          loading={loading}
          result={lastResult}
        />
      </div>

      <div className="orbital-top">
        <div className="orbital-content contrast-guard">
          <AnimatePresence mode="wait">
            {lastResult ? (
              <motion.div
                key="result-top"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center gap-4"
              >
                <button
                  onClick={handleReset}
                  className="px-6 py-2 border border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-black uppercase tracking-widest text-xs transition-all pointer-events-auto"
                >
                  Fermer le Cercle
                </button>
                <div className="text-2xl md:text-3xl font-oracle italic text-white mt-4 drop-shadow-lg px-4">
                  “<Typewriter text={lastResult.quote} />”
                </div>
              </motion.div>
            ) : error ? (
              <motion.div
                key={`error-top-${stage}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-clear inline-block max-w-xl"
              >
                <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-red-200/70 mb-3">
                  Oracle indisponible
                </p>
                <p className="text-lg md:text-xl text-red-100 italic font-oracle leading-relaxed">
                  {error}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`top-${stage}-${viewState}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {viewState === 'INPUT' && currentStep && (
                  <>
                    <p className="text-amber-500/60 text-xs font-mono uppercase tracking-[0.3em] mb-2">
                      {currentStep.label}
                    </p>
                    <h1 className="text-3xl md:text-4xl font-oracle text-white leading-tight drop-shadow-md">
                      {currentStep.q}
                    </h1>
                  </>
                )}

                {viewState === 'GUIDANCE' && (
                  <div className="glass-clear inline-block">
                    {guidanceLoading ? (
                      <p className="text-amber-400 animate-pulse italic">
                        L'Oracle écoute...
                      </p>
                    ) : (
                      <p className="text-lg md:text-xl text-amber-100 italic font-oracle leading-relaxed max-w-lg mx-auto">
                        {lastGuidance && (
                          <Typewriter
                            text={lastGuidance}
                            onComplete={() => setCanProceed(true)}
                          />
                        )}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="orbital-bottom">
        <div className="orbital-content contrast-guard">
          <AnimatePresence mode="wait">
            {lastResult && (
              <motion.div
                key="result-bottom"
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-clear w-full max-h-[40vh] overflow-y-auto custom-scrollbar text-left shadow-2xl"
                ref={textRef}
              >
                <div className="prose prose-invert prose-p:text-slate-200 prose-p:font-hud prose-p:leading-relaxed">
                  <p>
                    <Typewriter text={lastResult.interpretation} speed={5} />
                  </p>
                </div>
              </motion.div>
            )}

            {!lastResult && !loading && error && (
              <motion.div
                key={`error-bottom-${stage}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full flex flex-col items-center gap-4"
              >
                <button
                  type="button"
                  onClick={handleFinalDraw}
                  className="mt-2 px-8 py-2 bg-white/10 hover:bg-white hover:text-black border border-white/20 text-white transition-all uppercase text-xs tracking-widest rounded shadow-lg pointer-events-auto"
                >
                  Reessayer l invocation
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-8 py-2 border border-amber-500/50 text-amber-200 hover:bg-amber-500 hover:text-black uppercase tracking-widest text-xs transition-all pointer-events-auto"
                >
                  Recommencer le rituel
                </button>
              </motion.div>
            )}

            {!lastResult && !loading && !error && (
              <motion.div
                key={`bottom-${stage}-${viewState}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full flex flex-col items-center gap-4"
              >
                {viewState === 'INPUT' && currentStep && (
                  <>
                    {currentStep.type === 'cards' &&
                      renderCards(
                        currentStep.id === 'mood'
                          ? MOODS
                          : currentStep.id === 'weight'
                            ? WEIGHTS
                            : currentStep.id === 'desire'
                              ? DESIRES
                              : currentStep.id === 'sacrifice'
                                ? SACRIFICES
                                : currentStep.id === 'social'
                                  ? SOCIALS
                                  : ETERNITIES,
                        currentStep.id,
                      )}

                    {currentStep.type === 'formats' && (
                      <div className="grid grid-cols-2 gap-2 w-full">
                        {FORMATS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => updateField('format', f.id)}
                            className={`p-3 border text-left transition-all rounded backdrop-blur-md hover:bg-white/10 hover:text-white hover:border-white/40
                              ${
                                formData.format === f.id
                                  ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
                                  : 'bg-black/60 border-white/20 text-white/70'
                              }`}
                          >
                            <div className="font-oracle text-white">
                              {f.label}
                            </div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-tighter">
                              {f.desc}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {!currentStep.type && (
                      <input
                        autoFocus
                        type="text"
                        placeholder={currentStep.placeholder}
                        value={formData[currentStep.id] || ''}
                        onChange={(e) =>
                          updateField(currentStep.id, e.target.value)
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' && canValidate && handleValidate()
                        }
                        className="oracle-input pointer-events-auto"
                      />
                    )}

                    {canValidate && (
                      <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        type="button"
                        onClick={handleValidate}
                        className="mt-2 px-8 py-2 bg-white/10 hover:bg-white hover:text-black border border-white/20 text-white transition-all uppercase text-xs tracking-widest rounded shadow-lg pointer-events-auto"
                      >
                        Confirmer
                      </motion.button>
                    )}
                  </>
                )}

                {viewState === 'GUIDANCE' && canProceed && (
                  <motion.button
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    type="button"
                    onClick={handleNextStep}
                    className="px-10 py-3 bg-amber-600 hover:bg-amber-500 text-white font-oracle font-bold text-lg shadow-lg shadow-amber-900/50 rounded-sm pointer-events-auto"
                  >
                    {stage < 10
                      ? 'Continuer le voyage'
                      : 'Invoquer Zarathoustra'}
                  </motion.button>
                )}
              </motion.div>
            )}

            {loading && (
              <div className="text-amber-500 text-xs tracking-[0.4em] animate-pulse mb-8 z-50">
                ALIGNEMENT DES ASTRES...
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
