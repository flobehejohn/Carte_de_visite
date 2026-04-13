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

type StepDefinition = (typeof STEPS)[number];
type StepId = StepDefinition['id'];
type RitualFormData = Record<StepId, string>;

type RevealModelLike = Partial<{
  quote: string;
  interpretation: string;
  central_tension: string;
  explanation_short: string;
  explanation_long: string;
  chapter: string;
  author: string;
  citations: any[];
  sources: any[];
}>;

type OracleInteractionTarget = Parameters<
  typeof oracleInteractionBridge.setFocus
>[0]['target'];

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
] as const;

const INITIAL_FORM: RitualFormData = {
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

function cleanText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim();
  return '';
}

function firstNonEmptyText(...values: (string | undefined | null)[]): string {
  for (const value of values) {
    if (value) {
      const candidate = cleanText(value);
      if (candidate) return candidate;
    }
  }
  return '';
}

function collectRevealSources(
  revealModel: RevealModelLike | null,
  lastResult: any,
): string[] {
  const collected: string[] = [];

  const extract = (obj: any) => {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (obj.length > 5) collected.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach(extract);
    } else if (typeof obj === 'object') {
      if (obj.claim) collected.push(obj.claim);
      if (obj.motif) collected.push(obj.motif);
      if (obj.citation_id) collected.push(obj.citation_id);
      if (obj.text) collected.push(obj.text);
      if (obj.source) collected.push(obj.source);
    }
  };

  if (revealModel?.citations) extract(revealModel.citations);
  if (revealModel?.sources) extract(revealModel.sources);
  if (lastResult?.citations) extract(lastResult.citations);
  if (lastResult?.hermeneutic?.anchors) extract(lastResult.hermeneutic.anchors);
  if (lastResult?.composition?.motifs) extract(lastResult.composition.motifs);

  const unique = Array.from(
    new Set(collected.map((s) => s.trim()).filter(Boolean)),
  );

  if (unique.length === 0) {
    if (revealModel?.chapter) unique.push(`Chapitre : ${revealModel.chapter}`);
    if (lastResult?.chapter) unique.push(`Chapitre : ${lastResult.chapter}`);
  }

  return unique;
}

function renderQuotedPreview(value: string) {
  const clean = String(value ?? '').trim();
  if (!clean) return null;
  return `« ${clean} »`;
}

function pickStepOptions(stepId: StepId): string[] {
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

function isSmallViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

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
  const intervalRef = useRef<number | null>(null);
  const completedTextRef = useRef<string>(instant ? text : '');
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const nextText = text ?? '';

    if (!nextText) {
      setCharIndex(0);
      completedTextRef.current = '';
      return;
    }

    if (instant) {
      setCharIndex(nextText.length);
      if (completedTextRef.current !== nextText) {
        completedTextRef.current = nextText;
        onCompleteRef.current?.();
      }
      return;
    }

    if (completedTextRef.current === nextText) {
      setCharIndex(nextText.length);
      return;
    }

    setCharIndex(0);
    intervalRef.current = window.setInterval(
      () => {
        setCharIndex((prev) => Math.min(prev + 1, nextText.length));
      },
      Math.max(10, speed),
    );

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, speed, instant]);

  useEffect(() => {
    const nextText = text ?? '';
    if (!nextText || instant) return;
    if (charIndex >= nextText.length && completedTextRef.current !== nextText) {
      completedTextRef.current = nextText;
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onCompleteRef.current?.();
    }
  }, [charIndex, text, instant]);

  const hasText = text.length > 0;
  const isDone = instant || (hasText && charIndex >= text.length);

  return (
    <span>
      {text.slice(0, charIndex)}
      {hasText && !isDone && !instant && (
        <span className="cursor-blink">|</span>
      )}
    </span>
  );
};

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
  const [formData, setFormData] = useState<RitualFormData>(INITIAL_FORM);
  const [sceneData, setSceneData] = useState<RitualFormData>(INITIAL_FORM);
  const [viewState, setViewState] = useState<ViewState>('INPUT');
  const [canProceed, setCanProceed] = useState(false);
  const [guidanceEchoDone, setGuidanceEchoDone] = useState(false);
  const [isImmersion, setIsImmersion] = useState(false);

  const textRef = useRef<HTMLDivElement | null>(null);
  const finalDrawTimeoutRef = useRef<number | null>(null);
  const effectiveLoading = isE2E ? false : loading;

  useEffect(() => {
    return () => {
      if (finalDrawTimeoutRef.current !== null) {
        window.clearTimeout(finalDrawTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isImmersion) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsImmersion(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isImmersion]);

  useEffect(() => {
    if (!lastResult && isImmersion) setIsImmersion(false);
  }, [lastResult, isImmersion]);

  const currentStep = STEPS[stage - 1];
  const currentValue = currentStep ? (formData[currentStep.id] ?? '') : '';
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

  const revealModel = useMemo<RevealModelLike | null>(() => {
    if (!lastResult) return null;
    return (lastResult.finalReveal ??
      mapToFinalRevealModel(lastResult)) as RevealModelLike | null;
  }, [lastResult]);

  const revealQuote = useMemo(
    () => firstNonEmptyText(revealModel?.quote, (lastResult as any)?.quote),
    [revealModel, lastResult],
  );
  const revealInterpretation = useMemo(
    () =>
      firstNonEmptyText(
        revealModel?.central_tension,
        revealModel?.explanation_short,
        revealModel?.interpretation,
        (lastResult as any)?.interpretation,
      ),
    [revealModel, lastResult],
  );
  const revealProse = useMemo(
    () =>
      firstNonEmptyText(
        revealModel?.explanation_long,
        oraclePrimaryProse,
        (lastResult as any)?.interpretation,
      ),
    [revealModel, oraclePrimaryProse, lastResult],
  );
  const revealSources = useMemo(
    () => collectRevealSources(revealModel, lastResult),
    [revealModel, lastResult],
  );

  const updateField = (fieldKey: StepId, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const unlockProceed = () => {
    setGuidanceEchoDone(true);
    setCanProceed(true);
  };

  const handleTypewriterComplete = () => {
    setGuidanceEchoDone(true);
    setCanProceed(true);
    if (stage === 10) {
      handleFinalDraw();
    }
  };

  const handleFinalDraw = () => {
    clearGuidance();
    setStage(11);
    setViewState('INPUT');
    setCanProceed(false);
    setGuidanceEchoDone(false);
    setSceneData((prev) => ({ ...prev, ...formData }));

    const fallbackProgress = Math.max(0, Math.min(1, (stage - 1) / 9));
    const climateSnapshot = (() => {
      const fallback = {
        progress: fallbackProgress,
        mood: formData.mood || '',
      };
      try {
        const audit = (window as Window & { __ORB_AUDIT__?: any })
          .__ORB_AUDIT__;
        const snap = audit?.snapshot?.();
        if (!snap) return fallback;
        const climateTargets = snap?.targets ?? snap?.climateTargets;
        const palette = snap?.ritualGenome?.palette;
        const mobile = isSmallViewport();
        const fogDensity =
          typeof climateTargets?.fog?.density === 'number'
            ? mobile
              ? Math.min(climateTargets.fog.density, 0.2)
              : climateTargets.fog.density
            : climateTargets?.fog?.density;
        return {
          progress:
            typeof snap?.progress === 'number'
              ? snap.progress
              : fallbackProgress,
          mood: formData.mood || '',
          presetName: climateTargets?.presetName,
          fog: climateTargets?.fog
            ? { ...climateTargets.fog, density: fogDensity }
            : undefined,
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
      { climateSnapshot } as any,
    );
  };

  const executeValidation = async () => {
    if (!currentStep || !canValidate) return;
    clearGuidance();
    setViewState('GUIDANCE');
    setCanProceed(false);
    setGuidanceEchoDone(false);
    setSceneData((prev) => ({ ...prev, [currentStep.id]: currentValue }));

    if (isE2E) {
      if (currentStep.id === 'question') {
        handleFinalDraw();
        return;
      }
      setCanProceed(true);
      setGuidanceEchoDone(true);
      return;
    }
    const isSafe = await checkStep(currentStep.id, currentValue);
    if (!isSafe) return;
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
    if (finalDrawTimeoutRef.current !== null) {
      window.clearTimeout(finalDrawTimeoutRef.current);
      finalDrawTimeoutRef.current = null;
    }
    setIsImmersion(false);
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
      if (currentStep?.id !== 'question' && !guidanceLoading) {
        setCanProceed(true);
        setGuidanceEchoDone(true);
      }
      return;
    }
    if (guidanceLoading) {
      setCanProceed(false);
      setGuidanceEchoDone(false);
      return;
    }
    if (currentStep?.id === 'question') return;
    if (!guidanceEcho) {
      setGuidanceEchoDone(true);
      setCanProceed(true);
    }
  }, [viewState, guidanceLoading, guidanceEcho, currentStep?.id, isE2E]);

  useEffect(() => {
    if (!lastResult) return;
    setSceneData(
      (prev) =>
        ({
          ...prev,
          visualParams: (lastResult as any).visualParams,
          seed:
            (lastResult as any).seed ?? (lastResult as any).visualParams?.seed,
          textLength: getOracleTextLength(lastResult),
        }) as any,
    );
  }, [lastResult]);

  const setBridgeFocus = (
    target: OracleInteractionTarget,
    payload?: Record<string, unknown>,
  ) => {
    oracleInteractionBridge.setFocus({ target, source: 'html', payload });
    if (typeof window !== 'undefined')
      (
        window as Window & { __ORACLE_LAST_FOCUS__?: unknown }
      ).__ORACLE_LAST_FOCUS__ = { target, source: 'html' };
  };

  const renderCards = (items: string[], fieldKey: StepId) => (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full">
      {items.map((item, index) => (
        <button
          key={item}
          type="button"
          data-testid={`choice-${fieldKey}-${index}`}
          onClick={() => updateField(fieldKey, item)}
          className={`p-3 text-sm rounded border transition-all duration-300 font-oracle backdrop-blur-md hover:bg-white/10 hover:text-white hover:border-white/40 ${
            formData[fieldKey] === item
              ? 'bg-amber-500/20 border-amber-400 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.5)]'
              : 'bg-black/60 border-white/20 text-white/70'
          }`}
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
            data-testid="btn-immersion"
            aria-pressed={isImmersion}
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
            La source originelle n'a pu être transcrite.
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

      <AnimatePresence>
        {lastResult && isImmersion && (
          <motion.div
            data-testid="immersion-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none flex flex-col justify-between z-50"
          >
            <div className="w-full p-6 md:p-12 text-center bg-gradient-to-b from-black/80 to-transparent">
              <p
                data-testid="immersion-quote"
                className="text-xl md:text-3xl font-oracle italic text-amber-100/90 drop-shadow-lg"
              >
                {revealQuote}
              </p>
            </div>
            <motion.div
              initial={{ y: 30 }}
              animate={{ y: 0 }}
              className="w-full pb-8 md:pb-12 flex flex-col md:flex-row items-center justify-center gap-4 pointer-events-auto bg-gradient-to-t from-black/80 to-transparent pt-12"
            >
              <button
                type="button"
                data-testid="btn-return-to-verb"
                onClick={() => setIsImmersion(false)}
                className="px-6 py-3 bg-black/60 border border-white/20 text-white rounded hover:bg-white/10 hover:border-white/40 transition-all uppercase text-[11px] tracking-[0.2em] backdrop-blur-xl shadow-2xl flex items-center justify-center gap-2"
              >
                📖 Retour au Verbe
              </button>
              <button
                type="button"
                data-testid="btn-close-circle-immersion"
                onClick={handleReset}
                className="px-6 py-3 border border-amber-500/50 bg-black/80 text-amber-300 hover:bg-amber-500 hover:text-black uppercase text-[11px] tracking-[0.2em] transition-all rounded backdrop-blur-xl shadow-2xl flex items-center justify-center gap-2"
              >
                ⭘ Fermer le Cercle
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`absolute inset-0 z-10 flex flex-col justify-between px-4 pt-8 pb-12 md:pt-12 md:px-8 transition-opacity duration-500 ${
          isImmersion
            ? 'opacity-0 pointer-events-none'
            : 'opacity-100 pointer-events-none'
        }`}
      >
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
                                onComplete={handleTypewriterComplete}
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
                          {FORMATS.map((formatOption, index) => (
                            <button
                              key={formatOption.id}
                              type="button"
                              data-testid={`choice-format-${index}`}
                              onClick={() =>
                                updateField('format', formatOption.id)
                              }
                              className={`p-4 border text-left transition-all rounded-lg backdrop-blur-xl hover:bg-white/10 hover:border-white/40 ${
                                formData.format === formatOption.id
                                  ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.3)]'
                                  : 'bg-black/60 border-white/10'
                              }`}
                            >
                              <div
                                className={`font-oracle text-lg mb-1 ${
                                  formData.format === formatOption.id
                                    ? 'text-amber-100'
                                    : 'text-white/90'
                                }`}
                              >
                                {formatOption.label}
                              </div>
                              <div
                                className={`text-[10px] uppercase tracking-widest ${
                                  formData.format === formatOption.id
                                    ? 'text-amber-400/80'
                                    : 'text-white/40'
                                }`}
                              >
                                {formatOption.desc}
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
                          value={formData[currentStep.id] ?? ''}
                          onChange={(e) =>
                            updateField(currentStep.id, e.target.value)
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canValidate) {
                              void executeValidation();
                            }
                          }}
                          className="oracle-input w-full max-w-lg p-5 text-center text-lg bg-black/60 border border-white/20 text-white rounded-lg focus:outline-none focus:border-amber-500 focus:bg-black/80 transition-all shadow-2xl placeholder:text-white/20"
                        />
                      )}
                      {canValidate && (
                        <motion.button
                          initial={isE2E ? false : { opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          type="button"
                          data-testid="btn-confirm"
                          onClick={() => {
                            void executeValidation();
                          }}
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
