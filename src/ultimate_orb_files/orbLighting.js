import * as THREE from 'three';
import * as lightChoreo from './lightChoreo.js';

/**
 * orbLighting — version "Ultime"
 * - Gestion robuste + registry
 * - Intensités clampées (anti-lumières extrêmes)
 * - Helpers optionnels
 * - Intègre lightChoreo si présent (et ré-exporte sa config)
 */

const LIGHT_TYPES = ['directional', 'hemisphere', 'point', 'spot'];
const TARGET_ANCHORS = ['scene', 'orb', 'mesh1', 'mesh2', 'mesh3', 'mesh4'];
const DEFAULT_HELPER_COLOR = 0x4dbfff;

const MIN_SHADOW_MAP = 256;
const MAX_SHADOW_MAP = 4096;

let lastLog = 0;

function logStatus(ctx, message, level = 'info') {
  const now = (typeof performance !== 'undefined' && performance?.now) ? performance.now() : Date.now();
  if (now - lastLog > 1200) {
    lastLog = now;
    console.info(`[Light] ${message}`);
  }
  if (ctx.statusHandler) ctx.statusHandler(message, level);
}

function sanitizeShadowSize(value) {
  const num = Math.floor(Number(value) || 1024);
  const clamped = Math.max(MIN_SHADOW_MAP, Math.min(MAX_SHADOW_MAP, num));
  return Math.round(clamped / 256) * 256;
}

function ensureLightState(ctx) {
  if (!ctx.scene) throw new Error('[Light] ctx.scene manquant.');

  if (!ctx.lightsGroup) {
    ctx.lightsGroup = new THREE.Group();
    ctx.lightsGroup.name = 'Lights';
    ctx.scene.add(ctx.lightsGroup);
  }
  if (!ctx.lightHelpersGroup) {
    ctx.lightHelpersGroup = new THREE.Group();
    ctx.lightHelpersGroup.name = 'LightHelpers';
    ctx.scene.add(ctx.lightHelpersGroup);
  }
  if (!ctx.lightTargetsRoot) {
    ctx.lightTargetsRoot = new THREE.Group();
    ctx.lightTargetsRoot.name = 'LightTargets';
    ctx.scene.add(ctx.lightTargetsRoot);
  }
  if (!ctx.lightsRegistry || !(ctx.lightsRegistry instanceof Map)) ctx.lightsRegistry = new Map();
  if (!ctx.lightHelpers || !(ctx.lightHelpers instanceof Map)) ctx.lightHelpers = new Map();
  if (!ctx.lightAnchors) ctx.lightAnchors = {};

  if (!ctx.lightAnchors.scene) {
    const anchor = new THREE.Object3D();
    anchor.name = 'LightAnchorScene';
    ctx.lightTargetsRoot.add(anchor);
    ctx.lightAnchors.scene = anchor;
  }

  if (!ctx.orbGroup) {
    ctx.orbGroup = new THREE.Group();
    ctx.orbGroup.name = 'OrbGroup';
    ctx.scene.add(ctx.orbGroup);
  }
  ctx.lightAnchors.orb = ctx.orbGroup;

  (ctx.meshSlots || []).forEach(slot => {
    if (slot?.id && slot.group) ctx.lightAnchors[slot.id] = slot.group;
  });
}

function normalizeColor(input, fallback = 0xffffff) {
  try {
    if (input?.isColor) return input.clone();
    return new THREE.Color(input ?? fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function clampIntensity(type, intensity) {
  const v = Math.max(0, Number(intensity) || 0);
  // Garde-fous doux (évite les brûlures)
  if (type === 'directional') return Math.min(2.2, v);
  if (type === 'hemisphere') return Math.min(1.35, v);
  if (type === 'point') return Math.min(1.4, v);
  if (type === 'spot') return Math.min(1.6, v);
  return Math.min(2.2, v);
}

function isShadowCapable(type) {
  return type === 'directional' || type === 'spot' || type === 'point';
}

function getAnchorObject(ctx, anchorId) {
  ensureLightState(ctx);
  const id = TARGET_ANCHORS.includes(anchorId) ? anchorId : 'orb';
  return ctx.lightAnchors[id] || ctx.lightAnchors.orb;
}

function createHelper(entry) {
  let helper = null;
  if (entry.type === 'directional') helper = new THREE.DirectionalLightHelper(entry.light, 1);
  else if (entry.type === 'hemisphere') helper = new THREE.HemisphereLightHelper(entry.light, 0.75);
  else if (entry.type === 'point') helper = new THREE.PointLightHelper(entry.light, 0.35);
  else if (entry.type === 'spot') helper = new THREE.SpotLightHelper(entry.light);

  if (helper) {
    helper.visible = !!entry.helperVisible;
    if (helper.material?.color) helper.material.color.setHex(entry.config.helperColor.getHex());
  }
  return helper;
}

function applyShadowSettings(entry) {
  if (!entry?.light || !isShadowCapable(entry.type)) return;

  const size = sanitizeShadowSize(entry.config.shadowMapSize ?? 1024);
  entry.config.shadowMapSize = size;

  entry.light.castShadow = !!entry.config.castShadow;
  entry.light.shadow.mapSize.set(size, size);
  entry.light.shadow.radius = Number(entry.config.shadowRadius ?? 1.2);
  entry.light.shadow.bias = Number(entry.config.shadowBias ?? -0.0001);
  entry.light.shadow.normalBias = Number(entry.config.shadowNormalBias ?? 0);
}

function instantiateLight(entry) {
  const cfg = entry.config;
  const colorHex = cfg.color.getHex();
  let light;

  if (entry.type === 'directional') light = new THREE.DirectionalLight(colorHex, cfg.intensity);
  else if (entry.type === 'hemisphere') light = new THREE.HemisphereLight(colorHex, cfg.groundColor.getHex(), cfg.intensity);
  else if (entry.type === 'point') light = new THREE.PointLight(colorHex, cfg.intensity, cfg.distance, cfg.decay);
  else if (entry.type === 'spot') light = new THREE.SpotLight(colorHex, cfg.intensity, cfg.distance, cfg.angle, cfg.penumbra, cfg.decay);
  else light = new THREE.DirectionalLight(colorHex, cfg.intensity);

  light.name = entry.name;
  light.castShadow = !!cfg.castShadow;

  entry.light = light;
  applyShadowSettings(entry);
  return light;
}

function applyConfigToLight(ctx, entry) {
  if (!entry?.light) return;
  const cfg = entry.config;

  entry.light.visible = entry.active !== false;

  if (entry.light.isHemisphereLight) {
    entry.light.color.copy(cfg.color);
    entry.light.groundColor.copy(cfg.groundColor);
  } else {
    entry.light.color.copy(cfg.color);
  }

  entry.light.intensity = clampIntensity(entry.type, cfg.intensity);
  entry.light.position.set(cfg.position.x, cfg.position.y, cfg.position.z);

  if (entry.light.isPointLight || entry.light.isSpotLight) {
    entry.light.distance = cfg.distance;
    entry.light.decay = cfg.decay;
  }
  if (entry.light.isSpotLight) {
    entry.light.angle = cfg.angle;
    entry.light.penumbra = cfg.penumbra;
  }

  applyShadowSettings(entry);

  // target
  if (entry.light.isDirectionalLight || entry.light.isSpotLight) {
    const anchor = getAnchorObject(ctx, entry.anchor);
    if (anchor) entry.light.target = anchor;
  }

  // helper
  if (!entry.helper && entry.helperVisible) {
    entry.helper = createHelper(entry);
    if (entry.helper) ctx.lightHelpersGroup.add(entry.helper);
  }
  if (entry.helper) {
    entry.helper.visible = !!entry.helperVisible;
    entry.helper.update?.();
  }
}

function createEntry(ctx, config) {
  ensureLightState(ctx);

  const id = config.id || `light-${Math.floor(Date.now())}-${Math.floor(Math.random() * 1000)}`;
  const type = LIGHT_TYPES.includes(config.type) ? config.type : 'directional';

  const entry = {
    id,
    name: config.name || id,
    type,
    active: config.active !== false,
    anchor: TARGET_ANCHORS.includes(config.anchor) ? config.anchor : 'orb',
    helperVisible: !!config.helperVisible,
    isDynamic: !!config.isDynamic,
    locked: !!config.locked,
    helper: null,
    light: null,
    config: {
      intensity: clampIntensity(type, config.intensity ?? 1),
      color: normalizeColor(config.color, 0xffffff),
      groundColor: normalizeColor(config.groundColor ?? 0x222244, 0x222244),
      position: { x: config.position?.x ?? 0, y: config.position?.y ?? 0, z: config.position?.z ?? 0 },
      distance: Number(config.distance ?? 0),
      decay: Number(config.decay ?? 1),
      angle: Number(config.angle ?? Math.PI / 4),
      penumbra: Number(config.penumbra ?? 0.2),
      castShadow: !!config.castShadow,
      helperColor: normalizeColor(config.helperColor ?? DEFAULT_HELPER_COLOR, DEFAULT_HELPER_COLOR),
      shadowMapSize: sanitizeShadowSize(config.shadowMapSize ?? 1024),
      shadowRadius: Number(config.shadowRadius ?? 1.2),
      shadowBias: Number(config.shadowBias ?? -0.0001),
      shadowNormalBias: Number(config.shadowNormalBias ?? 0)
    }
  };

  entry.light = instantiateLight(entry);
  ctx.lightsGroup.add(entry.light);
  ctx.lightsRegistry.set(entry.id, entry);

  applyConfigToLight(ctx, entry);
  return entry;
}

function disposeEntry(ctx, entry) {
  if (!entry) return;
  if (entry.helper) {
    entry.helper.parent?.remove(entry.helper);
    entry.helper.dispose?.();
    entry.helper = null;
  }
  if (entry.light) {
    entry.light.parent?.remove(entry.light);
    entry.light.dispose?.();
    entry.light = null;
  }
  ctx.lightsRegistry?.delete(entry.id);
}

export function initDefaultLights(ctx) {
  ensureLightState(ctx);

  // clear
  for (const entry of ctx.lightsRegistry.values()) disposeEntry(ctx, entry);
  ctx.lightsRegistry.clear();

  // Key (sun)
  createEntry(ctx, {
    id: 'sun-main',
    name: 'SunMain',
    type: 'directional',
    intensity: 0.9,
    color: 0xffffff,
    position: { x: 6, y: 4, z: 2 },
    castShadow: false,
    anchor: 'orb'
  });

  // Fill (hemi)
  createEntry(ctx, {
    id: 'fill-hemi',
    name: 'FillHemi',
    type: 'hemisphere',
    intensity: 0.35,
    color: 0xffffff,
    groundColor: 0x07070a,
    position: { x: 0, y: 1, z: 0 }
  });

  // Rim (point)
  createEntry(ctx, {
    id: 'rim-point',
    name: 'RimPoint',
    type: 'point',
    intensity: 0.15,
    color: 0xaaccff,
    position: { x: -3.4, y: 2.0, z: -4.4 },
    distance: 0,
    decay: 1.2
  });

  logStatus(ctx, 'Default lights initialized.');
}

export function addLight(ctx, config = {}) {
  return createEntry(ctx, config);
}

export function removeLight(ctx, id) {
  ensureLightState(ctx);
  const entry = ctx.lightsRegistry.get(id);
  if (!entry) return false;
  disposeEntry(ctx, entry);
  return true;
}

export function setLightConfig(ctx, id, patch = {}) {
  ensureLightState(ctx);
  const entry = ctx.lightsRegistry.get(id);
  if (!entry) return null;
  if (entry.locked) return entry.config;

  const cfg = entry.config;

  // patch -> cfg (avec clamp)
  if (patch.intensity !== undefined) cfg.intensity = clampIntensity(entry.type, patch.intensity);
  if (patch.color !== undefined) cfg.color = normalizeColor(patch.color, cfg.color);
  if (patch.groundColor !== undefined) cfg.groundColor = normalizeColor(patch.groundColor, cfg.groundColor);

  if (patch.position) {
    cfg.position.x = Number(patch.position.x ?? cfg.position.x);
    cfg.position.y = Number(patch.position.y ?? cfg.position.y);
    cfg.position.z = Number(patch.position.z ?? cfg.position.z);
  }

  if (patch.distance !== undefined) cfg.distance = Number(patch.distance);
  if (patch.decay !== undefined) cfg.decay = Number(patch.decay);

  if (patch.angle !== undefined) cfg.angle = Number(patch.angle);
  if (patch.penumbra !== undefined) cfg.penumbra = Number(patch.penumbra);

  if (patch.castShadow !== undefined) cfg.castShadow = !!patch.castShadow;
  if (patch.shadowMapSize !== undefined) cfg.shadowMapSize = sanitizeShadowSize(patch.shadowMapSize);
  if (patch.shadowRadius !== undefined) cfg.shadowRadius = Number(patch.shadowRadius);
  if (patch.shadowBias !== undefined) cfg.shadowBias = Number(patch.shadowBias);
  if (patch.shadowNormalBias !== undefined) cfg.shadowNormalBias = Number(patch.shadowNormalBias);

  if (patch.helperVisible !== undefined) entry.helperVisible = !!patch.helperVisible;
  if (patch.helperColor !== undefined) cfg.helperColor = normalizeColor(patch.helperColor, cfg.helperColor);

  applyConfigToLight(ctx, entry);

  if (id === 'sun-main') logStatus(ctx, `Updated Sun: intensity=${cfg.intensity.toFixed(2)}`);

  return cfg;
}

export function setLightAnchor(ctx, id, anchorId) {
  ensureLightState(ctx);
  const entry = ctx.lightsRegistry.get(id);
  if (!entry) return false;
  entry.anchor = TARGET_ANCHORS.includes(anchorId) ? anchorId : 'orb';
  applyConfigToLight(ctx, entry);
  return true;
}

export function setLightHelperVisible(ctx, id, visible) {
  ensureLightState(ctx);
  const entry = ctx.lightsRegistry.get(id);
  if (!entry) return false;
  entry.helperVisible = !!visible;
  applyConfigToLight(ctx, entry);
  return true;
}

export function setAllLightHelpersVisible(ctx, visible) {
  ensureLightState(ctx);
  for (const entry of ctx.lightsRegistry.values()) {
    entry.helperVisible = !!visible;
    applyConfigToLight(ctx, entry);
  }
}

export function setLightHelperColor(ctx, id, color) {
  ensureLightState(ctx);
  const entry = ctx.lightsRegistry.get(id);
  if (!entry) return false;
  entry.config.helperColor = normalizeColor(color, DEFAULT_HELPER_COLOR);
  applyConfigToLight(ctx, entry);
  return true;
}

export function getLightsSnapshot(ctx) {
  ensureLightState(ctx);
  const out = [];
  for (const entry of ctx.lightsRegistry.values()) {
    out.push({
      id: entry.id,
      name: entry.name,
      type: entry.type,
      active: entry.active,
      anchor: entry.anchor,
      helperVisible: entry.helperVisible,
      config: {
        intensity: entry.config.intensity,
        color: `#${entry.config.color.getHexString()}`,
        groundColor: `#${entry.config.groundColor.getHexString()}`,
        position: { ...entry.config.position },
        distance: entry.config.distance,
        decay: entry.config.decay,
        angle: entry.config.angle,
        penumbra: entry.config.penumbra,
        castShadow: entry.config.castShadow,
        shadowMapSize: entry.config.shadowMapSize
      }
    });
  }
  return out;
}

export function getLightAnchors() {
  return [...TARGET_ANCHORS];
}

/**
 * Tick/Frame update:
 * - synchronise helpers
 * - applique les chorégraphies si dispo
 */
export function updateLightsForFrame(ctx, time = 0) {
  ensureLightState(ctx);

  // light choreo (safe)
  try {
    lightChoreo?.updateLightChoreographies?.(ctx, time);
  } catch (e) {
    // silencieux: la scène doit vivre même si le choreo casse
  }

  // helpers
  for (const entry of ctx.lightsRegistry.values()) {
    entry.helper?.update?.();
  }
}

/* --------- Ré-export des configs de lightChoreo (compat) --------- */
export const setLightChoreoConfig = lightChoreo.setLightChoreoConfig;
export const getLightChoreoConfig = lightChoreo.getLightChoreoConfig;
