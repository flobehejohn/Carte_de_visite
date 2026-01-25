import { GoogleGenerativeAI } from "@google/generative-ai";
import { OracleResult, RitualInput } from "../domain/types";

/**
 * zarathustraService — version "Ultime"
 * - Robuste : pas de crash si clé API absente
 * - Parsing JSON solide (extraction du premier objet JSON)
 * - Direction artistique enrichie (extras optionnels non-bloquants)
 */

const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;

const SAFE_FALLBACK_VISUAL = {
  primary_color: "#88aaff",
  chaos: 0.35,
  fog_density: 0.28,
  shape_archetype: "torusKnot"
} as const;

function log(...args: any[]) {

  console.log("[Zarathoustra]", ...args);
}
function warn(...args: any[]) {

  console.warn("[Zarathoustra]", ...args);
}

function extractJson(text: string): any | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function clamp01(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function hslToHex(h: number, s: number, l: number): string {
  // h,s,l: 0..1
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

// Fallback déterministe si pas de clé (ou erreur API)
function fallbackOracle(ritual: RitualInput): OracleResult {
  const seed = JSON.stringify(ritual || {});
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const r = () => {
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) / 4294967296);
  };

  const hue = r();
  const chaos = 0.25 + r() * 0.55;
  const fog = 0.15 + r() * 0.55;
  const shapes = ["sphere", "icosa", "torus", "torusKnot"] as const;
  const shape = shapes[Math.floor(r() * shapes.length)];

  const primary = hslToHex(hue, 0.65, 0.55);

  return {
    sentence: { id: `z-${Date.now()}`, text: "Le silence répond…", part_title: "Oracle", section_title: "Révélation" },
    quote: "Le silence répond…",
    interpretation: "Sans clé API, l'oracle tisse un motif intérieur.",
    keywords: ["silence", "motif", "respiration"],
    ritual,
    tone: { sentiment: 0.5, intensity: 0.8 },
    visualParams: {
      primary_color: primary,
      chaos,
      fog_density: fog,
      shape_archetype: shape
    } as any,
    textLength: 0,
    mainTheme: { themeId: "will", score: 1, label: "Volonté" }
  };
}

/* ---------------------- Modèles Gemini ---------------------- */
let genAI: GoogleGenerativeAI | null = null;
let oracleModel: any = null;
let guardianModel: any = null;

if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);

  // modèle créatif
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
  warn("Clé API absente (VITE_GOOGLE_API_KEY). Mode fallback activé.");
}

const GUARDIAN_PROMPT = `
RÔLE : Ombre de Zarathoustra.
MISSION : Commentaire philosophique court.
JSON : { "comment": "string", "isSafe": boolean }
`;

export async function getStepGuidance(step: string, value: string): Promise<{ comment: string; isSafe: boolean }> {
  if (!guardianModel) return { comment: "Le silence répond...", isSafe: true };

  try {
    const result = await guardianModel.generateContent([GUARDIAN_PROMPT, `Etape: ${step}, Choix: ${value}`]);
    const data = extractJson(result.response.text());
    if (!data) return { comment: "Le silence répond...", isSafe: true };

    return {
      comment: String(data.comment || "Le silence répond..."),
      isSafe: Boolean(data.isSafe ?? true)
    };
  } catch (e) {
    warn("Guardian error:", e);
    return { comment: "Le silence répond...", isSafe: true };
  }
}

const ORACLE_SYSTEM_PROMPT = `
INCARNATION : Zarathoustra.
OBJECTIF : Tirage divinatoire + Direction Artistique 3D.

DIRECTIVES VISUELLES :
- primary_color : Hex string.
- chaos : Float 0.0 - 1.0.
- fog_density : Float 0.0 - 1.0.
- shape_archetype : "sphere", "icosa", "torus", "torusKnot".

OPTIONNEL (si inspiré) :
- palette_mode : "mono" | "complement" | "split" | "triad" | "analog"
- wire_layers : Int 2 - 6
- particle_density : Float 0 - 1
- motion_signature : "calm" | "breath" | "link" | "storm" | "burst"

JSON SORTIE :
{
  "quote": "citation...",
  "interpretation": "analyse...",
  "keywords": ["mot1"],
  "visual_prescription": {
    "primary_color": "#ffaa00",
    "chaos": 0.5,
    "fog_density": 0.3,
    "shape_archetype": "torusKnot",
    "palette_mode": "analog",
    "wire_layers": 4,
    "particle_density": 0.6,
    "motion_signature": "breath"
  }
}
`;

export async function consultOracle(ritual: RitualInput): Promise<OracleResult> {
  log("Invocation pour :", ritual?.nameOrNickname);

  if (!oracleModel) return fallbackOracle(ritual);

  try {
    const prompt = `PROFIL: ${JSON.stringify(ritual as any)}.`;
    const result = await oracleModel.generateContent([ORACLE_SYSTEM_PROMPT, prompt]);

    const data = extractJson(result.response.text());
    if (!data) {
      warn("Réponse oracle non-JSON; fallback.");
      return fallbackOracle(ritual);
    }

    const vp = data.visual_prescription || {};
    const fullText = `${data.quote || ""}${data.interpretation || ""}`;

    const visualParams = {
      primary_color: vp.primary_color || SAFE_FALLBACK_VISUAL.primary_color,
      chaos: clamp01(vp.chaos ?? SAFE_FALLBACK_VISUAL.chaos),
      fog_density: clamp01(vp.fog_density ?? SAFE_FALLBACK_VISUAL.fog_density),
      shape_archetype: vp.shape_archetype || SAFE_FALLBACK_VISUAL.shape_archetype,

      // extras optionnels (si OracleResult est permissif)
      palette_mode: vp.palette_mode,
      wire_layers: vp.wire_layers,
      particle_density: vp.particle_density,
      motion_signature: vp.motion_signature
    } as any;

    return {
      sentence: { id: `z-${Date.now()}`, text: data.quote, part_title: "Oracle", section_title: "Révélation" },
      quote: data.quote,
      interpretation: data.interpretation,
      keywords: data.keywords || [],
      ritual,
      tone: { sentiment: 0.5, intensity: 1.0 },
      visualParams,
      textLength: fullText.length,
      mainTheme: { themeId: "will", score: 1, label: "Volonté" }
    };
  } catch (error) {
    warn("Oracle error:", error);
    return fallbackOracle(ritual);
  }
}
