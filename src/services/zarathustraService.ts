import { GoogleGenerativeAI } from "@google/generative-ai";
import { OracleResult, RitualInput } from "../domain/types";
import { normalizeVisualParams, VisualParams } from "./visualParams";
import { ZaraLangGuard } from "./zaraLangGuard";
import { extractFirstJsonObject } from "./jsonExtract";

/**
 * zarathustraService - version "Ultime"
 * - Robust: no crash if API key missing
 * - Strict JSON parsing (first parseable object)
 * - FR-only enforcement with max 1 retry
 * - Visual params normalization
 */

export type ClimateSnapshot = {
  progress?: number;
  mood?: string;
  presetName?: string;
  palette?: { mode?: string; primary?: string; accent?: string };
  fog?: { enabled?: boolean; density?: number; color?: string | number };
  bloom?: { strength?: number; radius?: number; threshold?: number };
  volume?: { glowIntensity?: number; backgroundStrength?: number; softness?: number; vignette?: number };
};

type OracleOptions = {
  climateSnapshot?: ClimateSnapshot | null;
  debug?: boolean;
};

const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;

const SAFE_FALLBACK_VISUAL: Required<Pick<VisualParams, "primary_color" | "chaos" | "fog_density" | "shape_archetype">> =
  {
    primary_color: "#88aaff",
    chaos: 0.35,
    fog_density: 0.28,
    shape_archetype: "torusKnot",
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
    }
  };
}

const logger = createThrottledLogger("Zarathoustra");

function stripDiacritics(input: string): string {
  try {
    return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    return input;
  }
}

function toAscii(input: unknown): string {
  const raw = stripDiacritics(String(input ?? ""));
  return raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ").trim();
}

function sanitizeRitualForPrompt(ritual: RitualInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (!ritual) return out;
  for (const [k, v] of Object.entries(ritual)) {
    out[k] = toAscii(v);
  }
  return out;
}

function fmtNumber(value: unknown, digits = 3): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "na";
  return n.toFixed(digits);
}

function fmtColor(value: unknown): string | null {
  if (typeof value === "string") {
    const s = toAscii(value);
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
    if (/^0x[0-9a-fA-F]{6}$/.test(s)) return `#${s.slice(2)}`;
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const hex = Math.max(0, Math.min(0xffffff, Math.round(value))).toString(16).padStart(6, "0");
    return `#${hex}`;
  }
  return null;
}

export function climateToPrompt(snapshot?: ClimateSnapshot | null): string {
  if (!snapshot) return "CLIMATE: none";
  const parts: string[] = [];
  if (snapshot.presetName) parts.push(`preset=${toAscii(snapshot.presetName)}`);
  if (snapshot.mood) parts.push(`mood=${toAscii(snapshot.mood)}`);
  if (snapshot.progress != null) parts.push(`progress=${fmtNumber(snapshot.progress, 2)}`);

  const fogColor = fmtColor(snapshot.fog?.color);
  if (snapshot.fog?.density != null || fogColor) {
    parts.push(
      `fog(density=${fmtNumber(snapshot.fog?.density, 4)},color=${fogColor ?? "na"})`
    );
  }

  if (snapshot.bloom) {
    parts.push(
      `bloom(strength=${fmtNumber(snapshot.bloom.strength, 2)},radius=${fmtNumber(
        snapshot.bloom.radius,
        2
      )},threshold=${fmtNumber(snapshot.bloom.threshold, 2)})`
    );
  }

  if (snapshot.volume) {
    parts.push(
      `volume(glow=${fmtNumber(snapshot.volume.glowIntensity, 2)},bg=${fmtNumber(
        snapshot.volume.backgroundStrength,
        2
      )},soft=${fmtNumber(snapshot.volume.softness, 2)},vignette=${fmtNumber(
        snapshot.volume.vignette,
        2
      )})`
    );
  }

  if (snapshot.palette) {
    const pPrimary = fmtColor(snapshot.palette.primary);
    const pAccent = fmtColor(snapshot.palette.accent);
    const pMode = snapshot.palette.mode ? toAscii(snapshot.palette.mode) : "na";
    parts.push(`palette(mode=${pMode},primary=${pPrimary ?? "na"},accent=${pAccent ?? "na"})`);
  }

  return parts.length ? `CLIMATE: ${parts.join(" ")}` : "CLIMATE: none";
}

function buildOraclePrompt(
  ritual: RitualInput,
  climateSnapshot?: ClimateSnapshot | null,
  opts?: { retryReason?: string }
): string {
  const lines: string[] = [];
  if (opts?.retryReason) lines.push(`RETRY_REASON: ${toAscii(opts.retryReason)}`);
  lines.push(`RITUAL: ${JSON.stringify(sanitizeRitualForPrompt(ritual))}`);
  lines.push(climateToPrompt(climateSnapshot));
  lines.push("SORTIE: JSON uniquement. Aucun markdown. Aucun texte hors JSON.");
  return lines.join("\n");
}

function buildGuardianPrompt(step: string, value: string, opts?: { retryReason?: string }): string {
  const lines: string[] = [];
  if (opts?.retryReason) lines.push(`RETRY_REASON: ${toAscii(opts.retryReason)}`);
  lines.push(`STEP: ${toAscii(step)}`);
  lines.push(`CHOICE: ${toAscii(value)}`);
  lines.push("SORTIE: JSON uniquement. Aucun markdown. Aucun texte hors JSON.");
  return lines.join("\n");
}

function extractJson(text: string): any | null {
  return extractFirstJsonObject(text);
}

function buildVisualParams(raw: any): VisualParams {
  const normalized = normalizeVisualParams(raw || {});
  const visualParams: VisualParams = {
    primary_color: normalized.primary_color ?? SAFE_FALLBACK_VISUAL.primary_color,
    chaos: normalized.chaos ?? SAFE_FALLBACK_VISUAL.chaos,
    fog_density: normalized.fog_density ?? SAFE_FALLBACK_VISUAL.fog_density,
    shape_archetype: normalized.shape_archetype ?? SAFE_FALLBACK_VISUAL.shape_archetype,
  };

  if (normalized.seed) visualParams.seed = normalized.seed;
  if (normalized.palette_mode) visualParams.palette_mode = normalized.palette_mode;
  if (normalized.wire_layers != null) visualParams.wire_layers = normalized.wire_layers;
  if (normalized.particle_density != null) visualParams.particle_density = normalized.particle_density;
  if (normalized.motion_signature) visualParams.motion_signature = normalized.motion_signature;

  return visualParams;
}

function buildOracleResult(ritual: RitualInput, data: any): OracleResult {
  const quote = String(data?.quote || "Le silence repond...");
  const interpretation = String(data?.interpretation || "L oracle demeure en attente.");
  const keywords = Array.isArray(data?.keywords) ? data.keywords.map((k: any) => String(k)) : [];
  const vpRaw = data?.visual_prescription || data?.visualParams || data?.visual_params || {};
  const visualParams = buildVisualParams(vpRaw);
  const textLength = `${quote}${interpretation}`.length;

  return {
    sentence: {
      id: `z-${Date.now()}`,
      text: quote,
      part_title: "Oracle",
      section_title: "Revelation"
    },
    quote,
    interpretation,
    keywords,
    ritual,
    tone: { sentiment: 0.5, intensity: 1.0, mysticism: 0.7 },
    themeScores: [],
    visualParams,
    textLength,
    seed: visualParams.seed,
    mainTheme: { themeId: "will", score: 1, label: "Volonte" }
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;

  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const v = Math.max(0, Math.min(255, Math.round(x * 255)));
    return v.toString(16).padStart(2, "0");
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function fallbackOracle(ritual: RitualInput): OracleResult {
  const seed = JSON.stringify(ritual || {});
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const r = () => {
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return (h >>> 0) / 4294967296;
  };

  const hue = r();
  const chaos = 0.25 + r() * 0.55;
  const fog = 0.15 + r() * 0.55;
  const shapes = ["sphere", "icosa", "torus", "torusKnot"] as const;
  const shape = shapes[Math.floor(r() * shapes.length)];
  const primary = hslToHex(hue, 0.65, 0.55);

  const visualParams = buildVisualParams({
    primary_color: primary,
    chaos,
    fog_density: fog,
    shape_archetype: shape
  });

  const quote = "Le silence repond...";
  const interpretation = "Sans cle API, l oracle tisse un motif interieur.";
  const textLength = `${quote}${interpretation}`.length;

  return {
    sentence: { id: `z-${Date.now()}`, text: quote, part_title: "Oracle", section_title: "Revelation" },
    quote,
    interpretation,
    keywords: ["silence", "motif", "respiration"],
    ritual,
    tone: { sentiment: 0.5, intensity: 0.8, mysticism: 0.7 },
    themeScores: [],
    visualParams,
    textLength,
    seed: visualParams.seed,
    mainTheme: { themeId: "will", score: 1, label: "Volonte" }
  };
}

/* ---------------------- Model setup ---------------------- */
let genAI: GoogleGenerativeAI | null = null;
let oracleModel: any = null;
let guardianModel: any = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  const modelConfig = {
    model: "gemini-2.0-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 1.2,
      topP: 0.95
    }
  };
  oracleModel = genAI.getGenerativeModel(modelConfig);
  guardianModel = genAI.getGenerativeModel(modelConfig);
} else {
  logger.warn("API key missing (VITE_GOOGLE_API_KEY). Fallback mode active.");
}

const ORACLE_SYSTEM_PROMPT = [
  "ROLE: Zarathoustra.",
  "LANGUE: francais uniquement. Aucun anglais, aucun franglais.",
  "STYLE: litteraire, court mais vivant.",
  "SORTIE: JSON uniquement. Aucun markdown. Aucun texte hors JSON.",
  "REGLES_VISUELLES:",
  "- primary_color: string '#RRGGBB'",
  "- chaos: float 0..1",
  "- fog_density: float 0..1",
  "- shape_archetype: one of 'sphere','icosa','torus','torusKnot','tetra','octa','box','cone','dodeca','capsule','octaDetail','knotComplex'",
  "OPTIONNEL:",
  "- palette_mode: 'mono'|'complement'|'split'|'triad'|'analog'",
  "- wire_layers: int 2..6",
  "- particle_density: float 0..1",
  "- motion_signature: 'calm'|'breath'|'link'|'storm'|'burst'",
  "JSON_SCHEMA:",
  "{",
  '  "quote":"string",',
  '  "interpretation":"string",',
  '  "keywords":["string"],',
  '  "visual_prescription":{',
  '    "primary_color":"#ffaa00",',
  '    "chaos":0.5,',
  '    "fog_density":0.3,',
  '    "shape_archetype":"torusKnot"',
  "  }",
  "}"
].join("\n");

const ORACLE_RETRY_JSON = "RETRY_JSON: retourne un JSON valide uniquement. Aucun markdown. Aucun texte hors JSON.";
const ORACLE_RETRY_FR = "RETRY_FR: reformule en francais uniquement. Aucun anglais. JSON uniquement.";

const GUARDIAN_SYSTEM_PROMPT = [
  "ROLE: Gardien du seuil.",
  "LANGUE: francais uniquement. Aucun anglais, aucun franglais.",
  "SORTIE: JSON uniquement. Aucun markdown. Aucun texte hors JSON.",
  "JSON_SCHEMA:",
  '{ "comment":"string", "isSafe":boolean }'
].join("\n");

const GUARDIAN_RETRY_JSON = "RETRY_JSON: retourne un JSON valide uniquement. Aucun markdown. Aucun texte hors JSON.";
const GUARDIAN_RETRY_FR = "RETRY_FR: reformule en francais uniquement. Aucun anglais. JSON uniquement.";

async function requestJsonWithRetry(
  model: any,
  prompts: string[],
  allowJsonRetry: boolean,
  retryHint: string
): Promise<{ data: any | null; rawText: string; jsonRetryUsed: boolean }> {
  const first = await model.generateContent(prompts);
  const firstText = first.response.text();
  const firstData = extractJson(firstText);
  if (firstData || !allowJsonRetry) {
    return { data: firstData, rawText: firstText, jsonRetryUsed: false };
  }

  const retryPrompts = [...prompts, retryHint];
  const retry = await model.generateContent(retryPrompts);
  const retryText = retry.response.text();
  const retryData = extractJson(retryText);

  return { data: retryData, rawText: retryText, jsonRetryUsed: true };
}

export async function getStepGuidance(
  step: string,
  value: string,
  opts?: { debug?: boolean }
): Promise<{ comment: string; isSafe: boolean }> {
  if (!guardianModel) return { comment: "Le silence repond...", isSafe: true };
  const guard = new ZaraLangGuard(!!opts?.debug);

  try {
    const basePrompt = buildGuardianPrompt(step, value);
    const basePrompts = [GUARDIAN_SYSTEM_PROMPT, basePrompt];
    let jsonRetryUsed = false;
    const first = await requestJsonWithRetry(guardianModel, basePrompts, true, GUARDIAN_RETRY_JSON);
    jsonRetryUsed = first.jsonRetryUsed;
    if (!first.data) return { comment: "Le silence repond...", isSafe: true };

    let comment = String(first.data.comment || "Le silence repond...");
    let isSafe = Boolean(first.data.isSafe ?? true);

    if (guard.shouldRetry(comment)) {
      const retryPrompt = buildGuardianPrompt(step, value, { retryReason: "EN_LIKELY" });
      const retryPrompts = [GUARDIAN_SYSTEM_PROMPT, retryPrompt, GUARDIAN_RETRY_FR];
      const retry = await requestJsonWithRetry(
        guardianModel,
        retryPrompts,
        !jsonRetryUsed,
        GUARDIAN_RETRY_JSON
      );
      if (retry.data) {
        comment = String(retry.data.comment || comment);
        isSafe = Boolean(retry.data.isSafe ?? isSafe);
      }
    }

    return { comment, isSafe };
  } catch (e) {
    logger.warn("Guardian error:", e);
    return { comment: "Le silence repond...", isSafe: true };
  }
}

export async function consultOracle(ritual: RitualInput, opts?: OracleOptions): Promise<OracleResult> {
  logger.log("Invocation for:", ritual?.nameOrNickname || "unknown");
  if (!oracleModel) return fallbackOracle(ritual);

  const guard = new ZaraLangGuard(!!opts?.debug);
  const basePrompt = buildOraclePrompt(ritual, opts?.climateSnapshot ?? null);
  const basePrompts = [ORACLE_SYSTEM_PROMPT, basePrompt];

  try {
    let jsonRetryUsed = false;
    const first = await requestJsonWithRetry(oracleModel, basePrompts, true, ORACLE_RETRY_JSON);
    jsonRetryUsed = first.jsonRetryUsed;
    if (!first.data) {
      logger.warn("Oracle response not JSON; fallback.");
      return fallbackOracle(ritual);
    }

    let result = buildOracleResult(ritual, first.data);
    const combined = `${result.quote} ${result.interpretation}`;

    if (guard.shouldRetry(combined)) {
      const retryPrompt = buildOraclePrompt(ritual, opts?.climateSnapshot ?? null, { retryReason: "EN_LIKELY" });
      const retryPrompts = [ORACLE_SYSTEM_PROMPT, retryPrompt, ORACLE_RETRY_FR];
      const retry = await requestJsonWithRetry(
        oracleModel,
        retryPrompts,
        !jsonRetryUsed,
        ORACLE_RETRY_JSON
      );
      if (!retry.data) {
        logger.warn("Oracle retry failed; fallback.");
        return fallbackOracle(ritual);
      }
      result = buildOracleResult(ritual, retry.data);
    }

    return result;
  } catch (error) {
    logger.warn("Oracle error:", error);
    return fallbackOracle(ritual);
  }
}
