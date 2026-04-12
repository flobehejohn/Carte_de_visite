import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

/**
 * orbGeometry — version "Ultime" (Durcie - Phase 1)
 * - Multi-wireframes en couches (subtiles, vivantes)
 * - Déformations stables (seeds par vertex) + 3 fréquences de bruit
 * - Lecture des paramètres via ctx.ritualGenome.geometry (interdépendance)
 * - Contrats de rendu stricts (Layers, RenderOrder, FrustumCulling, AuditCategory)
 */

const simplex = new SimplexNoise();

// Constantes de couche locales (Garantie de non-dépendance implicite)
const ORB_BASE_RENDER_LAYER = 0;

const DEFAULTS = {
  radius: 1.8,
  detail: 1,
  shapeType: 'icosa',
  wireframe: true,

  // deformation
  baseDeformAmplitude: 0.0,
  pulseAmplitude: 0.0,
  dislocation: 0.0,

  // noise freqs
  noiseFrequency1: 1.0,
  noiseFrequency2: 1.0,
  noiseFrequency3: 1.0,

  // wire layers
  wireLayers: 3,
  wireSpacing: 0.06,
  wireBreath: 0.25,
  wireOpacity: 0.15,
  wireOpacityInner: 0.08,
  wireHueShift: 0.02,
};

const temp = new THREE.Vector3();

// Wrapper robuste pour le bruit 4D (Sécurisation multi-environnement)
function resolveNoise4(x, y, z, w) {
  if (typeof simplex.noise4d === 'function') return simplex.noise4d(x, y, z, w);
  if (typeof simplex.noise4D === 'function') return simplex.noise4D(x, y, z, w);
  if (typeof simplex.noise4 === 'function') return simplex.noise4(x, y, z, w);
  // Fallback pseudo-aléatoire déterministe si aucune méthode n'est trouvée
  return (
    Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + w * 41.233) * 2.0 - 1.0
  );
}

function ensureOrbShellConfig(ctx) {
  if (!ctx.orbShellConfig) ctx.orbShellConfig = { ...DEFAULTS };
  else ctx.orbShellConfig = { ...DEFAULTS, ...ctx.orbShellConfig };
  // guards
  ctx.orbShellConfig.radius = Math.max(
    0.1,
    Number(ctx.orbShellConfig.radius || 1.8),
  );
  ctx.orbShellConfig.detail = Math.max(
    0,
    Math.floor(ctx.orbShellConfig.detail ?? 1),
  );
  ctx.orbShellConfig.wireLayers = Math.max(
    1,
    Math.min(8, Math.floor(ctx.orbShellConfig.wireLayers ?? 3)),
  );
  ctx.orbShellConfig.wireSpacing = Math.max(
    0.02,
    Math.min(0.14, Number(ctx.orbShellConfig.wireSpacing ?? 0.06)),
  );
  ctx.orbShellConfig.wireBreath = Math.max(
    0.05,
    Math.min(0.65, Number(ctx.orbShellConfig.wireBreath ?? 0.25)),
  );
  ctx.orbShellConfig.wireOpacity = Math.max(
    0,
    Math.min(1, Number(ctx.orbShellConfig.wireOpacity ?? 0.15)),
  );
  ctx.orbShellConfig.wireOpacityInner = Math.max(
    0,
    Math.min(1, Number(ctx.orbShellConfig.wireOpacityInner ?? 0.08)),
  );
  ctx.orbShellConfig.wireHueShift = Math.max(
    0,
    Math.min(0.2, Number(ctx.orbShellConfig.wireHueShift ?? 0.02)),
  );
  return ctx.orbShellConfig;
}

function getRng(ctx) {
  return ctx?.ritualGenome?.rng || null;
}

function rnd(ctx) {
  const r = getRng(ctx);
  return r ? r.random() : Math.random();
}

function buildGeometryFromConfig(cfg) {
  const r = Math.max(0.1, cfg.radius || 1.8);
  const d = Math.max(1, Math.floor(cfg.detail));

  switch (cfg.shapeType) {
    case 'sphere':
      return new THREE.SphereGeometry(r, 32 + d * 16, 20 + d * 10);
    case 'capsule':
      return new THREE.CapsuleGeometry(
        r * 0.72,
        r * 0.8,
        10 + d * 6,
        18 + d * 10,
      );
    case 'cone':
      return new THREE.ConeGeometry(r * 0.9, r * 1.8, 22 + d * 10, 1, true);
    case 'box':
      return new THREE.BoxGeometry(
        r * 1.5,
        r * 1.5,
        r * 1.5,
        4 + d * 4,
        4 + d * 4,
        4 + d * 4,
      );
    case 'torus':
      return new THREE.TorusGeometry(
        r * 0.8,
        r * 0.3,
        22 + d * 12,
        44 + d * 28,
      );
    case 'torusKnot':
      return new THREE.TorusKnotGeometry(
        r * 0.7,
        r * 0.2,
        120 + d * 64,
        14 + d * 10,
        cfg.knotP || 2,
        cfg.knotQ || 3,
      );
    case 'octaDetail':
      return new THREE.OctahedronGeometry(r, Math.max(2, d + 2));
    case 'octa':
      return new THREE.OctahedronGeometry(r, d);
    case 'tetra':
      return new THREE.TetrahedronGeometry(r, d);
    case 'dodeca':
      return new THREE.DodecahedronGeometry(r, d);
    case 'icosa':
    default:
      return new THREE.IcosahedronGeometry(r, d);
  }
}

function disposeMesh(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.geometry?.dispose?.();
  obj.material?.dispose?.();
}

function ensureGroups(ctx) {
  if (!ctx.layersGroup) {
    ctx.layersGroup = new THREE.Group();
    ctx.layersGroup.name = 'OrbLayers';
    (ctx.orbGroup || ctx.scene)?.add(ctx.layersGroup);
  }
  if (!ctx.orbGroup) {
    ctx.orbGroup = new THREE.Group();
    ctx.orbGroup.name = 'OrbGroup';
    ctx.scene?.add?.(ctx.orbGroup);
  }
}

function storeOriginalPositions(geometry, ctx) {
  const posAttribute = geometry.attributes.position;
  const count = posAttribute.count;
  const originalPos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) originalPos[i] = posAttribute.array[i];

  // seeds stables (pour dislocation + variation)
  const seeds = new Float32Array(count);
  const seeds2 = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seeds[i] = rnd(ctx) * 2 - 1;
    seeds2[i] = rnd(ctx) * 2 - 1;
  }

  geometry.userData.originalPositions = originalPos;
  geometry.userData.vertexSeed = seeds;
  geometry.userData.vertexSeed2 = seeds2;
}

/* --------------------------- API --------------------------- */
export function setRitualConfig(ctx, genome) {
  if (!genome?.geometry) return;
  ensureOrbShellConfig(ctx);
  const g = genome.geometry;

  ctx.orbShellConfig.noiseFrequency1 =
    g.noise?.f1 ?? ctx.orbShellConfig.noiseFrequency1;
  ctx.orbShellConfig.noiseFrequency2 =
    g.noise?.f2 ?? ctx.orbShellConfig.noiseFrequency2;
  ctx.orbShellConfig.noiseFrequency3 =
    g.noise?.f3 ?? ctx.orbShellConfig.noiseFrequency3;

  ctx.orbShellConfig.baseDeformAmplitude =
    g.baseDeform ?? ctx.orbShellConfig.baseDeformAmplitude;
  ctx.orbShellConfig.pulseAmplitude =
    g.pulseDeform ?? ctx.orbShellConfig.pulseAmplitude;
  ctx.orbShellConfig.dislocation =
    g.dislocation ?? ctx.orbShellConfig.dislocation;

  ctx.orbShellConfig.wireLayers =
    g.wire?.layers ?? ctx.orbShellConfig.wireLayers;
  ctx.orbShellConfig.wireSpacing =
    g.wire?.spacing ?? ctx.orbShellConfig.wireSpacing;
  ctx.orbShellConfig.wireBreath =
    g.wire?.breath ?? ctx.orbShellConfig.wireBreath;
  ctx.orbShellConfig.wireOpacity =
    g.wire?.opacityBase ?? ctx.orbShellConfig.wireOpacity;
  ctx.orbShellConfig.wireOpacityInner =
    g.wire?.opacityInner ?? ctx.orbShellConfig.wireOpacityInner;

  // couleur solide (si disponible)
  if (ctx.orbMaterial?.color && g.colors?.solid?.isColor) {
    ctx.orbMaterial.color.copy(g.colors.solid);
  }
}

export function createPolyhedron(ctx) {
  ensureGroups(ctx);
  const cfg = ensureOrbShellConfig(ctx);

  // Cleanup mesh + wireframes
  if (ctx.orbMesh) disposeMesh(ctx.orbMesh);
  if (ctx.wireFrames?.length) ctx.wireFrames.forEach((w) => disposeMesh(w));
  ctx.wireFrames = [];

  const geometry = buildGeometryFromConfig(cfg);
  storeOriginalPositions(geometry, ctx);

  // DURCISSEMENT : Fallback visible et stable
  const material = ctx.ensureOrbMaterial
    ? ctx.ensureOrbMaterial()
    : new THREE.MeshStandardMaterial({
        color: 0x8a9ba8,
        roughness: 0.4,
        metalness: 0.6,
        side: THREE.DoubleSide,
      });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'OrbMesh';

  // CONTRATS DE RENDU ET D'AUDIT (Phase 1)
  mesh.layers.set(ORB_BASE_RENDER_LAYER);
  mesh.renderOrder = 0;
  mesh.frustumCulled = false; // Protège contre les disparitions sur forte déformation
  mesh.userData.renderAuditCategory = 'orb-solid';
  mesh.userData.postprocessIsolation = false;

  ctx.layersGroup.add(mesh);
  ctx.orbMesh = mesh;

  createOrbLayers(ctx);
}

export function createOrbLayers(ctx) {
  ensureGroups(ctx);
  const cfg = ensureOrbShellConfig(ctx);
  const mesh = ctx.orbMesh;
  if (!mesh) return;

  // purge
  if (ctx.wireFrames?.length) ctx.wireFrames.forEach((w) => disposeMesh(w));
  ctx.wireFrames = [];

  const layers = cfg.wireLayers;
  const spacing = cfg.wireSpacing;

  for (let i = 0; i < layers; i++) {
    const wireGeo = new THREE.WireframeGeometry(mesh.geometry);
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    if (!wireMat.userData) wireMat.userData = {};
    wireMat.userData.opacityBase = 0;

    const wire = new THREE.LineSegments(wireGeo, wireMat);
    wire.name = `ExoWireframe-${i}`;

    // CONTRATS DE RENDU ET D'AUDIT (Phase 1)
    wire.layers.set(ORB_BASE_RENDER_LAYER);
    wire.renderOrder = 1 + i;
    wire.frustumCulled = false;
    wire.userData.renderAuditCategory = 'orb-wire';
    wire.userData.postprocessIsolation = false;

    // scale: couches fines
    const baseScale = 1.03 + i * spacing;
    wire.scale.setScalar(baseScale);

    // metadata "vivant"
    wire.userData.layerIndex = i;
    wire.userData.baseScale = baseScale;
    wire.userData.phase = rnd(ctx) * Math.PI * 2;
    wire.userData.twist = (rnd(ctx) * 2 - 1) * 0.06;
    wire.userData.opacityMul = 1.0 - (i / Math.max(1, layers - 1)) * 0.25;

    ctx.layersGroup.add(wire);
    ctx.wireFrames.push(wire);
  }
}

/**
 * Mise à jour du style wireframe en temps réel.
 * - baseColor / baseOpacity donnent la teinte globale
 * - time et turbulence animent les couches
 */
export function updateWireframeStyle(
  ctx,
  baseColor,
  baseOpacity,
  time = 0,
  turbulence = 0.2,
) {
  if (!ctx.wireFrames?.length) return;
  const cfg = ensureOrbShellConfig(ctx);

  const col = baseColor?.isColor
    ? baseColor
    : new THREE.Color(baseColor ?? 0xffffff);
  const hsl = col.getHSL({ h: 0, s: 0, l: 0 });

  const visibilityMul = Number.isFinite(ctx?._wireVisibilityMul)
    ? Math.max(0, ctx._wireVisibilityMul)
    : 1;

  for (const w of ctx.wireFrames) {
    const i = w.userData.layerIndex ?? 0;
    const phase = w.userData.phase ?? 0;

    // respiration
    const breath =
      Math.sin(time * (0.6 + cfg.wireBreath) + phase) *
      (0.08 + turbulence * 0.12);
    const micro =
      Math.sin(time * (2.1 + i * 0.15) + phase * 1.7) *
      (0.03 + turbulence * 0.08);

    // opacité: couches internes plus faibles
    const innerFalloff = THREE.MathUtils.lerp(
      cfg.wireOpacity,
      cfg.wireOpacityInner,
      i / Math.max(1, cfg.wireLayers - 1),
    );
    const baseFactor =
      innerFalloff * (0.85 + breath + micro) * (w.userData.opacityMul ?? 1);
    const op = Math.max(0, Math.min(1, baseFactor * baseOpacity));

    // teinte: micro-shift par couche
    const hue =
      (hsl.h + (i - cfg.wireLayers * 0.5) * cfg.wireHueShift + breath * 0.008) %
      1;
    const c = new THREE.Color().setHSL(
      (hue + 1) % 1,
      Math.min(1, hsl.s + 0.05),
      Math.min(1, hsl.l + 0.15),
    );

    w.material.color.copy(c);
    if (Array.isArray(w.material)) {
      for (const mat of w.material) {
        if (!mat) continue;
        if (!mat.userData) mat.userData = {};
        mat.userData.opacityBase = op;
      }
    } else if (w.material) {
      if (!w.material.userData) w.material.userData = {};
      w.material.userData.opacityBase = op;
    }
    // opacity is applied by applyMaterials (RenderParams)
    w.visible = op * visibilityMul > 0.01;

    // scale + twist légers (couches "vivantes")
    const scalePulse = 1 + breath * 0.06;
    w.scale.setScalar((w.userData.baseScale ?? 1.05) * scalePulse);
    w.rotation.y = (w.userData.twist ?? 0) * time;
    w.rotation.x = Math.sin(time * 0.18 + phase) * 0.08;
  }
}

export function setShapeType(ctx, type) {
  ensureOrbShellConfig(ctx);
  if (ctx.orbShellConfig.shapeType === type) return;
  ctx.orbShellConfig.shapeType = type;
  createPolyhedron(ctx);
}

export function setPolyDetail(ctx, detail) {
  ensureOrbShellConfig(ctx);
  if (ctx.orbShellConfig.detail === detail) return;
  ctx.orbShellConfig.detail = detail;
  createPolyhedron(ctx);
}

export function setDeformAmplitude(ctx, { base, pulse, dislocation }) {
  ensureOrbShellConfig(ctx);
  ctx.orbShellConfig.baseDeformAmplitude = Number(
    base ?? ctx.orbShellConfig.baseDeformAmplitude,
  );
  ctx.orbShellConfig.pulseAmplitude = Number(
    pulse ?? ctx.orbShellConfig.pulseAmplitude,
  );
  if (dislocation !== undefined)
    ctx.orbShellConfig.dislocation = Number(
      dislocation ?? ctx.orbShellConfig.dislocation,
    );
}

export function setNoiseFrequencies(ctx, freqs) {
  ensureOrbShellConfig(ctx);
  Object.assign(ctx.orbShellConfig, freqs);
}

/**
 * Déformation du polyhedron.
 * - stable (pas de Math.random() par frame)
 * - 3 bandes de bruit (f1/f2/f3)
 * - dislocation seedée
 */
export function deformPolyhedron(ctx, time = 0) {
  const mesh = ctx.orbMesh;
  if (!mesh?.geometry) return;

  const cfg = ensureOrbShellConfig(ctx);
  const originalPos = mesh.geometry.userData.originalPositions;
  const s1 = mesh.geometry.userData.vertexSeed;
  const s2 = mesh.geometry.userData.vertexSeed2;
  if (!originalPos || !s1 || !s2) return;

  const posAttr = mesh.geometry.attributes.position;
  const count = posAttr.count;

  // DURCISSEMENT: Garde-fou sur les amplitudes pour éviter l'explosion
  const baseAmp = Math.max(0, Math.min(2.0, cfg.baseDeformAmplitude || 0));
  const pulseFactor =
    Math.sin(time * 1.8) * Math.max(0, Math.min(2.0, cfg.pulseAmplitude || 0));
  const disl = Math.max(0, Math.min(2.0, cfg.dislocation || 0));

  const f1 = cfg.noiseFrequency1 || 1;
  const f2 = cfg.noiseFrequency2 || 1;
  const f3 = cfg.noiseFrequency3 || 1;

  for (let i = 0; i < count; i++) {
    const ox = originalPos[i * 3];
    const oy = originalPos[i * 3 + 1];
    const oz = originalPos[i * 3 + 2];

    temp.set(ox, oy, oz);
    const len = temp.length() || 1;
    temp.divideScalar(len); // normal

    // 3 couches de bruit avec le wrapper robuste
    const n1 = resolveNoise4(ox * f1, oy * f1, oz * f1, time * 0.18);
    const n2 = resolveNoise4(ox * f2 + 11.3, oy * f2, oz * f2, time * 0.12);
    const n3 = resolveNoise4(ox * f3, oy * f3 + 17.7, oz * f3, time * 0.09);

    // mix subtil (pas chaotique)
    const mixed = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;

    // dislocation stable
    const seedDisp = s1[i] * 0.7 + s2[i] * 0.3;

    // amplitude: base + pulse + dislocation
    const disp = mixed * baseAmp + mixed * pulseFactor + seedDisp * disl;

    const totalScale = 1.0 + disp;
    posAttr.setXYZ(i, ox * totalScale, oy * totalScale, oz * totalScale);
  }

  posAttr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

