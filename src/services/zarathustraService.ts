import { OracleResult, RitualInput } from '../domain/types';
import { geminiGenerate } from '../lib/geminiClient';
import { extractFirstJsonObject } from './jsonExtract';
import { normalizeVisualParams, VisualParams } from './visualParams';
import { ZaraLangGuard } from './zaraLangGuard';

export type ClimateSnapshot = {
  progress?: number;
  mood?: string;
  presetName?: string;
  palette?: { mode?: string; primary?: string; accent?: string };
  fog?: { enabled?: boolean; density?: number; color?: string | number };
  bloom?: { strength?: number; radius?: number; threshold?: number };
  volume?: {
    glowIntensity?: number;
    backgroundStrength?: number;
    softness?: number;
    vignette?: number;
  };
};

type OracleOptions = {
  climateSnapshot?: ClimateSnapshot | null;
  debug?: boolean;
};

const SAFE_FALLBACK_VISUAL: Required<
  Pick<
    VisualParams,
    'primary_color' | 'chaos' | 'fog_density' | 'shape_archetype'
  >
> = {
  primary_color: '#88aaff',
  chaos: 0.35,
  fog_density: 0.28,
  shape_archetype: 'torusKnot',
};

const LOG_THROTTLE_MS = 1200;

function createThrottledLogger(prefix: string, throttleMs = LOG_THROTTLE_MS) {
  let lastLogMs = 0;
  const canLog = () => {
    const now = Date.now();
    if (now - lastLogMs < throttleMs) return false;
    lastLogMs = now;
    return true;
  };
  return {
    log: (...args: any[]) => {
      if (!canLog()) return;
      // eslint-disable-next-line no-console
      console.info(`[${prefix}]`, ...args);
    },
    warn: (...args: any[]) => {
      if (!canLog()) return;
      // eslint-disable-next-line no-console
      console.warn(`[${prefix}]`, ...args);
    },
  };
}

const logger = createThrottledLogger('Zarathoustra');

function toAscii(input: unknown): string {
  const raw = String(input ?? '');
  try {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
      .trim();
  } catch {
    return raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').trim();
  }
}

function sanitizeRitualForPrompt(ritual: RitualInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ritual) return out;
  for (const [k, v] of Object.entries(ritual)) out[k] = toAscii(v);
  return out;
}

function buildVisualParams(raw: any): VisualParams {
  const normalized = normalizeVisualParams(raw || {});
  const visualParams: VisualParams = {
    primary_color:
      normalized.primary_color ?? SAFE_FALLBACK_VISUAL.primary_color,
    chaos: normalized.chaos ?? SAFE_FALLBACK_VISUAL.chaos,
    fog_density: normalized.fog_density ?? SAFE_FALLBACK_VISUAL.fog_density,
    shape_archetype:
      normalized.shape_archetype ?? SAFE_FALLBACK_VISUAL.shape_archetype,
  };

  if (normalized.seed) visualParams.seed = normalized.seed;
  if (normalized.palette_mode)
    visualParams.palette_mode = normalized.palette_mode;
  if (normalized.wire_layers != null)
    visualParams.wire_layers = normalized.wire_layers;
  if (normalized.particle_density != null)
    visualParams.particle_density = normalized.particle_density;
  if (normalized.motion_signature)
    visualParams.motion_signature = normalized.motion_signature;

  return visualParams;
}

function buildOracleResult(ritual: RitualInput, data: any): OracleResult {
  const quote = String(data?.quote || 'Le silence repond...');
  const interpretation = String(
    data?.interpretation || 'L oracle demeure en attente.',
  );
  const keywords = Array.isArray(data?.keywords)
    ? data.keywords.map((k: any) => String(k))
    : [];

  const vpRaw =
    data?.visual_prescription ||
    data?.visualParams ||
    data?.visual_params ||
    {};
  const visualParams = buildVisualParams(vpRaw);

  const citations = Array.isArray(data?.citations) ? data.citations : [];
  const first = citations.length > 0 ? citations[0] : null;

  const sentence = {
    id: String(first?.id ?? `z-${Date.now()}`),
    text: String(first?.text ?? quote),
    part_title: String(first?.part_title ?? 'Zarathoustra'),
    section_title: String(first?.section_title ?? 'Source'),
  };

  const textLength = `${quote}${interpretation}`.length;

  return {
    sentence,
    quote,
    interpretation,
    keywords,
    ritual,
    tone: { sentiment: 0.5, intensity: 1.0, mysticism: 0.7 },
    themeScores: [],
    visualParams,
    textLength,
    seed: visualParams.seed,
    mainTheme: { themeId: 'will', score: 1, label: 'Volonte' },
  };
}

function fallbackOracle(ritual: RitualInput): OracleResult {
  return buildOracleResult(ritual, {
    quote: 'Le silence repond...',
    interpretation: 'Sans voix, le texte demeure. Recommence le geste.',
    keywords: ['silence', 'texte', 'seuil'],
    visual_prescription: SAFE_FALLBACK_VISUAL,
  });
}

export async function getStepGuidance(
  step: string,
  value: string,
  opts?: { debug?: boolean },
): Promise<{ comment: string; isSafe: boolean }> {
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const prompt = [
      'Decide si le choix est acceptable dans le rituel.',
      'Reponds court, utile, sans moraliser.',
      'Format JSON strict attendu.',
    ].join('\n');

    const r = await geminiGenerate(prompt, {
      mode: 'guardian',
      step: toAscii(step),
      value: toAscii(value),
      expectJson: true,
      temperature: 0.2,
      maxOutputTokens: 400,
    });

    const data =
      r.json ??
      (typeof r.text === 'string' ? extractFirstJsonObject(r.text) : null);

    if (!data) return { comment: 'Le seuil reste ouvert.', isSafe: true };

    let comment = String((data as any).comment || 'Le seuil reste ouvert.');
    const isSafe = Boolean((data as any).isSafe ?? true);

    if (guard.shouldRetry(comment)) {
      // light client-side retry (server already does 1 retry)
      comment = comment.replace(/[A-Za-z]/g, '');
    }

    return { comment: comment.trim() || 'Le seuil reste ouvert.', isSafe };
  } catch (e) {
    logger.warn('Guardian error:', e);
    return { comment: 'Le seuil reste ouvert.', isSafe: true };
  }
}

export async function consultOracle(
  ritual: RitualInput,
  opts?: OracleOptions,
): Promise<OracleResult> {
  logger.log('Invocation for:', ritual?.nameOrNickname || 'unknown');

  const cleanRitual = sanitizeRitualForPrompt(ritual);
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const prompt = [
      'Tu es Zarathoustra.',
      'Donne une reponse-oracle breve mais vivante.',
      'Tu dois t appuyer sur les citations fournies par le serveur.',
      'Format JSON strict attendu.',
    ].join('\n');

    const r = await geminiGenerate(prompt, {
      mode: 'oracle',
      ritual: cleanRitual,
      climateSnapshot: opts?.climateSnapshot ?? null,
      expectJson: true,
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 1200,
    });

    const data =
      r.json ??
      (typeof r.text === 'string' ? extractFirstJsonObject(r.text) : null);

    if (!data) return fallbackOracle(ritual);

    const result = buildOracleResult(ritual, data);
    const combined = `${result.quote} ${result.interpretation}`;

    if (guard.shouldRetry(combined)) return fallbackOracle(ritual);

    return result;
  } catch (error) {
    logger.warn('Oracle error:', error);
    return fallbackOracle(ritual);
  }
}
