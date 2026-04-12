import { AnimatePresence, motion } from 'framer-motion';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useOracleContext } from '../../context/OracleContext';
import { mapToFinalRevealModel } from '../../domain/oracleText/finalRevealModel';
import { oracleInteractionBridge } from '../../domain/oracleText/InteractionBridge';
import {
  extractGuidanceParts,
  getOraclePrimaryProse,
  getOracleTextLength,
} from '../../services/zarathustraService';
import { Oracle3DScene } from './Oracle3DScene';

const Oracle3DSceneMemo = memo(Oracle3DScene);

type ViewState = 'INPUT' | 'GUIDANCE';

const Typewriter = ({
  text,
  speed = 20,
  instant = false,
  onComplete,
}: {
  text: string;
  speed?: number;
  instant?: boolean;
  onComplete?: () => void;
}) => {
  const [charIndex, setCharIndex] = useState(instant ? text.length : 0);
  const completionRef = useRef(false);

  useEffect(() => {
    completionRef.current = false;
    if (!text) {
      setCharIndex(0);
      return;
    }
    if (instant) {
      setCharIndex(text.length);
      completionRef.current = true;
      onComplete?.();
      return;
    }
    setCharIndex(0);
    const interval = window.setInterval(
      () => {
        setCharIndex((prev) => (prev < text.length ? prev + 1 : prev));
      },
      Math.max(10, speed),
    );
    return () => window.clearInterval(interval);
  }, [text, speed, instant, onComplete]);

  useEffect(() => {
    if (instant) return;
    if (text && charIndex >= text.length && !completionRef.current) {
      completionRef.current = true;
      onComplete?.();
    }
  }, [charIndex, text, instant, onComplete]);

  return (
    <span>
      {text.slice(0, charIndex)}
      {!instant && <span className="cursor-blink">|</span>}
    </span>
  );
};

const STEPS = [
  {
    id: 'name',
    label: 'I. Identité',
    q: 'Qui ose éveiller Zarathoustra ?',
    placeholder: 'Ton nom...',
    mode: 'input',
  },
  {
    id: 'mood',
    label: 'II. Atmosphère',
    q: 'Quel ciel pèse sur ton âme ?',
    mode: 'cards',
  },
  {
    id: 'weight',
    label: 'III. Le Fardeau',
    q: 'Quelle pierre est la plus lourde ?',
    mode: 'cards',
  },
  {
    id: 'fear',
    label: "IV. L'Entrave",
    q: "Qu'est-ce qui te fait trembler ?",
    placeholder: 'Ma peur est...',
    mode: 'input',
  },
  {
    id: 'desire',
    label: 'V. Le Désir',
    q: 'Vers quelle étoile tends-tu ?',
    mode: 'cards',
  },
  {
    id: 'sacrifice',
    label: 'VI. Le Combat',
    q: 'Que dois-tu sacrifier ?',
    mode: 'cards',
  },
  {
    id: 'social',
    label: 'VII. Le Troupeau',
    q: 'Où te tiens-tu parmi les autres ?',
    mode: 'cards',
  },
  {
    id: 'eternity',
    label: "VIII. L'Éternité",
    q: 'Si cet instant se répétait...',
    mode: 'cards',
  },
  {
    id: 'format',
    label: 'IX. Le Réceptacle',
    q: 'Quelle forme pour la vérité ?',
    mode: 'formats',
  },
  {
    id: 'question',
    label: 'X. Invocation',
    q: "Parle maintenant à l'Abîme.",
    placeholder: 'Ta question...',
    mode: 'input',
  },
] as const;

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

function renderQuotedPreview(value: string) {
  const clean = String(value ?? '').trim();
  if (!clean) return null;
  return `« ${clean} »`;
}

function pickStepOptions(stepId: string): string[] {
  switch (stepId) {
    case 'mood':
      return MOODS;
    case 'weight':
      return WEIGHTS;
    case 'desire':
      return DESIRES;
    case 'sacrifice':
      return SACRIFICES;
    case 'social':
      return SOCIALS;
    case 'eternity':
      return ETERNITIES;
    default:
      return [];
  }
}

interface RitualWizardProps {
  isE2E?: boolean;
}

export default function RitualWizard({ isE2E = false }: RitualWizardProps) {
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
  } = useOracleContext();

  const [stage, setStage] = useState<number>(1);
  const [formData, setFormData] = useState<any>(INITIAL_FORM);
  const [sceneData, setSceneData] = useState<any>(INITIAL_FORM);
  const [viewState, setViewState] = useState<ViewState>('INPUT');
  const [canProceed, setCanProceed] = useState(false);
  const [guidanceEchoDone, setGuidanceEchoDone] = useState(false);

  // 🛡️ STATE IMMERSION : Contrôle l'affichage du panneau texte vs HUD 3D
  const [isImmersion, setIsImmersion] = useState(false);

  const textRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const finalDrawTimeoutRef = useRef<number | null>(null);
  const effectiveLoading = isE2E ? false : loading;

  useEffect(() => {
    return () => {
      if (finalDrawTimeoutRef.current)
        window.clearTimeout(finalDrawTimeoutRef.current);
    };
  }, []);

  const currentStep = STEPS[stage - 1];
  const currentValue = currentStep ? formData[currentStep.id] || '' : '';
  const currentValuePreview = useMemo(
    () => renderQuotedPreview(currentValue),
    [currentValue],
  );
  const canValidate = Boolean(String(currentValue ?? '').trim().length > 0);

  const { echo: guidanceEcho, subcomment: guidanceSubcomment } = useMemo(
    () => extractGuidanceParts(lastGuidance),
    [lastGuidance],
  );
  const oraclePrimaryProse = useMemo(
    () => getOraclePrimaryProse(lastResult),
    [lastResult],
  );

  const revealModel = useMemo(() => {
    if (!lastResult) return null;
    return lastResult.finalReveal ?? mapToFinalRevealModel(lastResult);
  }, [lastResult]);

  const revealQuote = useMemo(
    () => revealModel?.quote || lastResult?.quote || '',
    [revealModel, lastResult],
  );
  const revealInterpretation = useMemo(
    () =>
      revealModel?.central_tension ||
      revealModel?.explanation_short ||
      lastResult?.interpretation ||
      '',
    [revealModel, lastResult],
  );
  const revealProse = useMemo(
    () =>
      revealModel?.explanation_long ||
      oraclePrimaryProse ||
      lastResult?.interpretation ||
      '',
    [revealModel, oraclePrimaryProse, lastResult],
  );
  const revealSources = useMemo(() => {
    if (Array.isArray(revealModel?.citations) && revealModel.citations.length)
      return revealModel.citations;
    if (Array.isArray(lastResult?.hermeneutic?.anchors))
      return lastResult.hermeneutic.anchors.map(
        (a: any) => a.claim || a.motif || a.citation_id,
      );
    return [];
  }, [revealModel, lastResult]);

  const updateField = (fieldKey: string, value: string) => {
    setFormData((prev: any) => ({ ...prev, [fieldKey]: value }));
  };

  const unlockProceed = () => {
    setGuidanceEchoDone(true);
    setCanProceed(true);
  };

  const handleFinalDraw = () => {
    clearGuidance();
    setStage(11);
    setViewState('INPUT');
    setCanProceed(false);
    setGuidanceEchoDone(false);
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
        const climateTargets = snap?.targets ?? snap?.climateTargets;
        const palette = snap?.ritualGenome?.palette;
        return {
          progress:
            typeof snap?.progress === 'number'
              ? snap.progress
              : fallbackProgress,
          mood: formData.mood || '',
          presetName: climateTargets?.presetName,
          fog: climateTargets?.fog,
          bloom: climateTargets?.bloom,
          volume: climateTargets?.volume,
          palette: {
            mode: snap?.ritualGenome?.paletteMode,
            primary: palette?.primary?.hex,
            accent: palette?.accent?.hex,
          },
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

  const handleValidate = async () => {
    if (!currentStep || !canValidate) return;
    clearGuidance();
    setViewState('GUIDANCE');
    setCanProceed(false);
    setGuidanceEchoDone(false);
    setSceneData((prev: any) => ({ ...prev, [currentStep.id]: currentValue }));
    if (isE2E) {
      if (currentStep.id === 'question') {
        finalDrawTimeoutRef.current = window.setTimeout(
          () => handleFinalDraw(),
          0,
        );
        return;
      }
      unlockProceed();
      return;
    }
    const isSafe = await checkStep(currentStep.id, currentValue);
    if (!isSafe) return;
    if (currentStep.id === 'question') {
      finalDrawTimeoutRef.current = window.setTimeout(
        () => handleFinalDraw(),
        1500,
      );
    }
  };

  const handleNextStep = () => {
    clearGuidance();
    setCanProceed(false);
    setGuidanceEchoDone(false);
    if (stage < 10) {
      setStage((prev) => prev + 1);
      setViewState('INPUT');
      return;
    }
    handleFinalDraw();
  };

  const handleReset = () => {
    if (finalDrawTimeoutRef.current) {
      window.clearTimeout(finalDrawTimeoutRef.current);
      finalDrawTimeoutRef.current = null;
    }
    setIsImmersion(false); // Réinitialise l'immersion
    reset?.();
    clearGuidance();
    setStage(1);
    setFormData(INITIAL_FORM);
    setSceneData(INITIAL_FORM);
    setViewState('INPUT');
    setCanProceed(false);
    setGuidanceEchoDone(false);
    oracleInteractionBridge.clearFocus('html');
  };

  useEffect(() => {
    if (viewState !== 'GUIDANCE') return;
    if (isE2E) {
      if (currentStep?.id !== 'question' && !guidanceLoading) unlockProceed();
      return;
    }
    if (guidanceLoading) {
      setCanProceed(false);
      setGuidanceEchoDone(false);
      return;
    }
    if (currentStep?.id === 'question') {
      setGuidanceEchoDone(true);
      setCanProceed(true);
      return;
    }
    if (!guidanceEcho) {
      setGuidanceEchoDone(true);
      setCanProceed(true);
    }
  }, [viewState, guidanceLoading, guidanceEcho, currentStep?.id, isE2E]);

  useEffect(() => {
    if (!lastResult) return;
    setSceneData((prev: any) => ({
      ...prev,
      visualParams: lastResult.visualParams,
      seed: lastResult.seed ?? lastResult.visualParams?.seed,
      textLength: getOracleTextLength(lastResult),
    }));
  }, [lastResult]);

  const setBridgeFocus = (target: any, payload?: any) => {
    oracleInteractionBridge.setFocus({ target, source: 'html', payload });
    if (typeof window !== 'undefined')
      (window as any).__ORACLE_LAST_FOCUS__ = { target, source: 'html' };
  };

  const renderCards = (items: string[], fieldKey: string) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full">
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          data-testid={`choice-${fieldKey}-${index}`}
          onClick={() => updateField(fieldKey, item)}
          className={`p-3 text-sm rounded border transition-all duration-300 font-oracle backdrop-blur-md hover:bg-white/10 hover:text-white hover:border-white/40 ${formData[fieldKey] === item ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.5)]' : 'bg-black/60 border-white/20 text-white/70'}`}
        >
          {item}
        </button>
      ))}
    </div>
  );

  const renderRevealPanel = () => (
    <motion.div
      key="reveal-panel"
      initial={isE2E ? false : { opacity: 0, y: 12, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 12, filter: 'blur(10px)' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      data-testid="reveal-panel"
      className="glass-clear w-full max-w-4xl pointer-events-auto p-6 md:p-8 rounded-xl border border-white/10 shadow-2xl bg-black/40 backdrop-blur-md"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8 border-b border-white/10 pb-6">
        <div>
          <p
            data-testid="reveal-chapter"
            className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-300/70 mb-2"
          >
            {revealModel?.chapter || 'RÉVÉLATION'}
          </p>
          <h2 className="text-2xl md:text-3xl font-oracle text-white">
            {revealModel?.author || 'Zarathoustra'}
          </h2>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setIsImmersion(true)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white/5 border border-white/20 text-white hover:bg-white/15 uppercase tracking-widest text-xs transition-all rounded shadow-lg flex items-center justify-center gap-2"
          >
            <span className="text-amber-400">👁️</span> Contempler
          </button>
          <button
            type="button"
            data-testid="btn-restart"
            onClick={handleReset}
            className="flex-1 md:flex-none px-5 py-2.5 border border-amber-500/50 text-amber-200 hover:bg-amber-500 hover:text-black uppercase tracking-widest text-xs transition-all rounded shadow-lg"
          >
            Fermer le Cercle
          </button>
        </div>
      </div>
      <blockquote
        data-testid="reveal-quote"
        className="text-xl md:text-3xl font-oracle italic text-amber-100 leading-relaxed mb-8 border-l-2 border-amber-500/50 pl-6"
        onMouseEnter={() => setBridgeFocus('quote')}
        onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
      >
        {revealQuote}
      </blockquote>
      <p
        data-testid="reveal-interpretation"
        className="text-sm md:text-base text-white/72 leading-relaxed font-hud mb-6"
        onMouseEnter={() => setBridgeFocus('interpretation')}
        onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
      >
        {revealInterpretation}
      </p>
      <div
        data-testid="reveal-prose"
        className="text-base md:text-lg text-white/90 leading-8 font-oracle mb-8"
        onMouseEnter={() => setBridgeFocus('prose')}
        onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
      >
        {revealProse}
      </div>
      <div
        data-testid="reveal-sources"
        className="bg-black/30 rounded-lg p-5 border border-white/5"
        onMouseEnter={() => setBridgeFocus('sources')}
        onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-amber-300/70 mb-4 flex items-center gap-2">
          <span className="w-4 h-px bg-amber-300/50" /> Sources
        </p>
        {revealSources.length > 0 ? (
          <ul className="space-y-3">
            {revealSources.map((source, index) => (
              <li
                key={`${source}-${index}`}
                data-testid={`reveal-citation-${index}`}
                className="text-sm text-white/75 hover:text-amber-200 transition-colors cursor-default"
                onMouseEnter={() =>
                  setBridgeFocus('citation', { index, source })
                }
                onMouseLeave={() => oracleInteractionBridge.clearFocus('html')}
              >
                {source}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/40 italic">
            Aucune source affichable.
          </p>
        )}
      </div>
    </motion.div>
  );

  return (
    <div
      data-testid="ritual-root"
      data-stage={stage}
      className="relative w-full h-screen min-h-screen bg-[#020408] overflow-hidden isolate"
    >
      {/* SCÈNE 3D - Toujours en fond, reçoit les clics si l'UI HTML ne bloque pas */}
      <div className="absolute inset-0 z-0">
        <Oracle3DSceneMemo
          formData={sceneData}
          stage={stage}
          loading={effectiveLoading}
          result={lastResult}
          progress={
            lastResult ? 1.0 : effectiveLoading ? 0.85 : (stage / 10) * 0.8
          }
        />
      </div>

      {/* HUD D'IMMERSION FLOTTANT */}
      <AnimatePresence>
        {lastResult && isImmersion && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-8 md:bottom-12 left-1/2 -translate-x-1/2 flex flex-col md:flex-row gap-4 z-50 pointer-events-auto"
          >
            <button
              onClick={() => setIsImmersion(false)}
              className="px-6 py-3 bg-black/60 border border-white/20 text-white rounded hover:bg-white/10 hover:border-white/40 transition-all uppercase text-[11px] tracking-[0.2em] backdrop-blur-xl shadow-2xl flex items-center justify-center gap-2"
            >
              📖 Retour au Verbe
            </button>
            <button
              onClick={handleReset}
              className="px-6 py-3 border border-amber-500/50 bg-black/80 text-amber-300 hover:bg-amber-500 hover:text-black uppercase text-[11px] tracking-[0.2em] transition-all rounded backdrop-blur-xl shadow-2xl flex items-center justify-center gap-2"
            >
              ⭘ Fermer le Cercle
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COUCHE UI PRINCIPALE - pointer-events-none laisse passer les clics vers la 3D */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between px-4 pt-8 pb-12 md:pt-12 md:px-8">
        <div className="w-full flex justify-center flex-shrink-0 max-h-full overflow-y-auto custom-scrollbar">
          <div className="pointer-events-auto w-full max-w-4xl flex flex-col items-center">
            <AnimatePresence mode="wait">
              {lastResult ? (
                !isImmersion ? (
                  renderRevealPanel()
                ) : null
              ) : error ? (
                <motion.div
                  key={`error-top-${stage}`}
                  initial={isE2E ? false : { opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-clear inline-block max-w-xl p-6 rounded border border-red-500/30"
                >
                  <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-red-400 mb-3">
                    Oracle indisponible
                  </p>
                  <p className="text-lg md:text-xl text-red-100 italic font-oracle leading-relaxed">
                    {error}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key={`top-${stage}-${viewState}`}
                  initial={
                    isE2E ? false : { opacity: 0, y: -20, filter: 'blur(5px)' }
                  }
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={
                    isE2E ? false : { opacity: 0, y: -20, filter: 'blur(5px)' }
                  }
                  transition={{ duration: 0.5 }}
                  className="w-full"
                >
                  {currentStep && (
                    <div className="max-w-3xl mx-auto text-center mt-4">
                      <p
                        data-testid="step-title"
                        className="text-amber-500/60 text-xs font-mono uppercase tracking-[0.3em] mb-3"
                      >
                        {currentStep.label}
                      </p>
                      <h1
                        data-testid="step-question"
                        className="text-3xl md:text-5xl font-oracle text-white leading-tight drop-shadow-2xl"
                      >
                        {currentStep.q}
                      </h1>
                    </div>
                  )}
                  {viewState === 'GUIDANCE' && currentStep && (
                    <div className="glass-clear inline-block max-w-3xl text-left p-6 md:p-8 rounded-lg mt-8 border border-white/5 bg-black/40 backdrop-blur-md">
                      <p className="text-[11px] font-mono uppercase tracking-[0.35em] text-amber-400/70 mb-4 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-amber-500/20 flex items-center justify-center">
                          <span className="w-1 h-1 bg-amber-400 rounded-full animate-ping" />
                        </span>{' '}
                        Écho du seuil
                      </p>
                      {currentValuePreview && (
                        <p className="text-sm md:text-base text-white/50 italic mb-5 font-oracle border-l-2 border-white/10 pl-4">
                          {currentValuePreview}
                        </p>
                      )}
                      {guidanceLoading && !isE2E ? (
                        <p className="text-amber-300 animate-pulse italic font-oracle">
                          L'abîme écoute...
                        </p>
                      ) : (
                        <div className="max-w-2xl">
                          <p
                            data-testid="guidance-echo"
                            className="text-lg md:text-2xl text-amber-100 font-oracle leading-relaxed"
                          >
                            {guidanceEcho ? (
                              <Typewriter
                                text={guidanceEcho}
                                speed={14}
                                instant={isE2E}
                                onComplete={() => {
                                  setGuidanceEchoDone(true);
                                  setCanProceed(true);
                                }}
                              />
                            ) : (
                              'Le seuil reste ouvert.'
                            )}
                          </p>
                          {guidanceSubcomment && (
                            <motion.p
                              initial={isE2E ? false : { opacity: 0, y: 8 }}
                              animate={{
                                opacity:
                                  guidanceEchoDone || !guidanceEcho ? 1 : 0.2,
                                y: 0,
                              }}
                              className="mt-5 text-sm md:text-base text-white/70 leading-relaxed font-hud border-l border-amber-500/30 pl-4 bg-gradient-to-r from-amber-500/5 to-transparent py-2"
                            >
                              {guidanceSubcomment}
                            </motion.p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* CONTROLES INFERIEURS */}
        <div className="w-full flex justify-center flex-shrink-0 mt-auto pt-8">
          <div className="pointer-events-auto w-full max-w-4xl flex flex-col items-center">
            <AnimatePresence mode="wait">
              {!lastResult && !effectiveLoading && error && (
                <motion.div
                  key={`error-bottom-${stage}`}
                  initial={isE2E ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full flex flex-col sm:flex-row justify-center items-center gap-4"
                >
                  <button
                    type="button"
                    onClick={handleFinalDraw}
                    className="px-8 py-3 bg-amber-600 hover:bg-amber-500 text-black transition-all uppercase text-xs font-bold tracking-widest rounded shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                  >
                    Réessayer l’invocation
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-8 py-3 border border-white/20 text-white/70 hover:bg-white hover:text-black uppercase tracking-widest text-xs transition-all rounded"
                  >
                    Fermer le Cercle
                  </button>
                </motion.div>
              )}
              {!lastResult && !effectiveLoading && !error && (
                <motion.div
                  key={`bottom-${stage}-${viewState}`}
                  initial={isE2E ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={isE2E ? false : { opacity: 0, y: 20 }}
                  className="w-full flex flex-col items-center gap-4"
                >
                  {viewState === 'INPUT' && currentStep && (
                    <>
                      {currentStep.mode === 'cards' &&
                        renderCards(
                          pickStepOptions(currentStep.id),
                          currentStep.id,
                        )}
                      {currentStep.mode === 'formats' && (
                        <div className="grid grid-cols-2 gap-3 w-full max-w-2xl">
                          {FORMATS.map((f, index) => (
                            <button
                              key={f.id}
                              type="button"
                              data-testid={`choice-format-${index}`}
                              onClick={() => updateField('format', f.id)}
                              className={`p-4 border text-left transition-all rounded-lg backdrop-blur-xl hover:bg-white/10 hover:border-white/40 ${formData.format === f.id ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.3)]' : 'bg-black/60 border-white/10'}`}
                            >
                              <div
                                className={`font-oracle text-lg mb-1 ${formData.format === f.id ? 'text-amber-100' : 'text-white/90'}`}
                              >
                                {f.label}
                              </div>
                              <div
                                className={`text-[10px] uppercase tracking-widest ${formData.format === f.id ? 'text-amber-400/80' : 'text-white/40'}`}
                              >
                                {f.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {currentStep.mode === 'input' && (
                        <input
                          autoFocus
                          type="text"
                          data-testid="step-input"
                          placeholder={currentStep.placeholder}
                          value={formData[currentStep.id] || ''}
                          onChange={(e) =>
                            updateField(currentStep.id, e.target.value)
                          }
                          onKeyDown={(e) =>
                            e.key === 'Enter' && canValidate && handleValidate()
                          }
                          className="oracle-input w-full max-w-lg p-5 text-center text-lg bg-black/60 border border-white/20 text-white rounded-lg focus:outline-none focus:border-amber-500 focus:bg-black/80 transition-all shadow-2xl placeholder:text-white/20"
                        />
                      )}
                      {canValidate && (
                        <motion.button
                          initial={isE2E ? false : { opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          type="button"
                          data-testid="btn-confirm"
                          onClick={handleValidate}
                          className="mt-6 px-12 py-3 bg-white/10 hover:bg-white hover:text-black border border-white/20 text-white transition-all uppercase text-xs tracking-[0.2em] rounded shadow-lg"
                        >
                          Confirmer
                        </motion.button>
                      )}
                    </>
                  )}
                  {viewState === 'GUIDANCE' && canProceed && stage < 10 && (
                    <motion.button
                      initial={isE2E ? false : { scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      type="button"
                      data-testid="btn-next"
                      onClick={handleNextStep}
                      className="px-12 py-4 mt-6 bg-amber-600 hover:bg-amber-500 text-black font-oracle font-bold text-lg shadow-[0_0_30px_rgba(245,158,11,0.4)] rounded transition-all hover:scale-105 active:scale-95"
                    >
                      Continuer le voyage
                    </motion.button>
                  )}
                </motion.div>
              )}
              {effectiveLoading && (
                <div
                  data-testid="loading-indicator"
                  className="flex items-center gap-3 text-amber-500 text-[10px] tracking-[0.4em] font-mono uppercase bg-black/50 px-6 py-2 rounded-full border border-amber-500/20 backdrop-blur-md"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />{' '}
                  Alignement des astres...
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="sr-only" ref={textRef}>
        <p>Parole oracle</p>
        <p>{revealQuote}</p>
        <p>{revealProse}</p>
      </div>
    </div>
  );
}
