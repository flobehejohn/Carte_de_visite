export type VisualParams = {
  primary_color?: string;   // '#RRGGBB'
  chaos?: number;           // 0..1
  fog_density?: number;     // 0..1
  shape_archetype?: string; // whitelist
  seed?: string;

  // extras optionnels
  palette_mode?: string;
  wire_layers?: number;
  particle_density?: number;
  motion_signature?: string;
};

const SHAPES = new Set([
  'tetra', 'octa', 'box', 'cone',
  'icosa', 'dodeca', 'sphere', 'capsule', 'torus',
  'torusKnot', 'octaDetail', 'knotComplex'
]);

const PALETTE_MODES = new Set(['mono', 'complement', 'split', 'triad', 'analog']);
const MOTION_SIGNATURES = new Set(['calm', 'breath', 'link', 'storm', 'burst']);

function clamp(v: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// clamp01 "safe undefined" : si NaN/Inf => undefined (on drop le champ)
function clamp01(v: unknown): number | undefined {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, n));
}

function normalizeHexColor(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const s = input.trim();
  if (!s) return undefined;

  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  if (/^0x[0-9a-fA-F]{6}$/.test(s)) return `#${s.slice(2)}`;

  return undefined;
}

export function normalizeVisualParams(raw: any): VisualParams {
  const vp: VisualParams = {};
  const r = raw ?? {};

  // Couleur
  const c = normalizeHexColor(r.primary_color);
  if (c) vp.primary_color = c;

  // Scalars (drop si invalide)
  if (r.chaos != null) {
    const chaos = clamp01(r.chaos);
    if (chaos != null) vp.chaos = chaos;
  }

  if (r.fog_density != null) {
    const fog = clamp01(r.fog_density);
    if (fog != null) vp.fog_density = fog;
  }

  // Seed
  if (typeof r.seed === "string" && r.seed.trim()) vp.seed = r.seed.trim();

  // Shape (tolérant à la casse)
  if (typeof r.shape_archetype === "string") {
    const s = r.shape_archetype.trim();
    if (s) {
      if (SHAPES.has(s)) vp.shape_archetype = s;
      else {
        const sLower = s.toLowerCase();
        const canonical =
          sLower === "torusknot" ? "torusKnot"
          : sLower === "octadetail" ? "octaDetail"
          : sLower === "knotcomplex" ? "knotComplex"
          : sLower;

        if (SHAPES.has(canonical)) vp.shape_archetype = canonical;
      }
    }
  }

  // Palette mode
  if (typeof r.palette_mode === "string") {
    const m = r.palette_mode.trim().toLowerCase();
    if (m && PALETTE_MODES.has(m)) vp.palette_mode = m;
  }

  // Wire layers (clamp si plausible, sinon drop)
  if (r.wire_layers != null) {
    const n = Number(r.wire_layers);
    if (Number.isFinite(n)) {
      const isPlausible = n >= 0 && n <= 20;
      if (isPlausible) {
        const wRounded = Math.round(n);
        const wClamped = clamp(wRounded, 2, 6);
        vp.wire_layers = wClamped;
      }
    }
  }

  // Particle density (drop si invalide)
  if (r.particle_density != null) {
    const pd = clamp01(r.particle_density);
    if (pd != null) vp.particle_density = pd;
  }

  // Motion signature
  if (typeof r.motion_signature === "string") {
    const m = r.motion_signature.trim().toLowerCase();
    if (m && MOTION_SIGNATURES.has(m)) vp.motion_signature = m;
  }

  return vp;
}
