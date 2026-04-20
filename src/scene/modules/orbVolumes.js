import * as THREE from 'three';
import { getQualityProfileFromContext } from '../performance/QualityGovernor';

/**
 * orbVolumes — version "Ultime"
 * - Background sphérique réactif + plan de glow doux
 * - Noise organique (fBm light) + pulsation contrôlée
 * - Paramètres issus de ctx.ritualGenome.volume (interdépendance)
 */

const DEFAULT_VOLUME_CONFIG = {
  enabled: true,

  scale: 70,
  backgroundColor: 0x121722,
  backgroundStrength: 0.36,
  vignette: 1.05,

  glowColor: 0xffffff,
  glowIntensity: 0.72,
  glowSize: 24.0,
  glowPulseSpeed: 0.55,
  glowPulseAmp: 0.06,

  softness: 0.56,

  noise: {
    scale: 4.5,
    speed: 0.18,
    amount: 0.08,
  },
};


function getRuntimeFrameIndex(ctx) {
  return Math.max(
    0,
    Number(
      ctx?.runtimeFrameIndex ??
        ctx?.runtimeTelemetry?.orchestratorUpdateCount ??
        0,
    ) || 0,
  );
}

function shouldSkipVolumeUpdate(ctx) {
  const qualityProfile = getQualityProfileFromContext(ctx, 'high');
  const divisor = Math.max(1, Number(qualityProfile.partialUpdateDivisors?.volumes ?? 1));
  const frameIndex = getRuntimeFrameIndex(ctx);
  if (divisor <= 1 || frameIndex <= 0) return false;
  return frameIndex % divisor !== 0;
}

function mergeDeep(target, patch) {
  if (!patch || typeof patch !== 'object') return target;
  Object.entries(patch).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object')
        target[key] = { ...value };
      else mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, Number(v) || 0));
}

function normalizeConfig(cfg) {
  cfg.enabled = cfg.enabled !== false;
  cfg.scale = clamp(cfg.scale ?? 70, 10, 200);
  cfg.backgroundStrength = clamp(cfg.backgroundStrength ?? 0.36, 0.08, 0.95);
  cfg.vignette = clamp(cfg.vignette ?? 1.15, 0.1, 3.0);
  cfg.glowIntensity = clamp(cfg.glowIntensity ?? 0.72, 0.18, 1.35);
  cfg.glowSize = clamp(cfg.glowSize ?? 24.0, 12.0, 80.0);
  cfg.glowPulseSpeed = clamp(cfg.glowPulseSpeed ?? 0.55, 0, 3.0);
  cfg.glowPulseAmp = clamp(cfg.glowPulseAmp ?? 0.06, 0, 0.22);
  cfg.softness = clamp(cfg.softness ?? 0.56, 0.12, 0.9);

  cfg.noise = cfg.noise || {};
  cfg.noise.scale = clamp(cfg.noise.scale ?? 4.5, 0.5, 18.0);
  cfg.noise.speed = clamp(cfg.noise.speed ?? 0.18, 0.0, 1.5);
  cfg.noise.amount = clamp(cfg.noise.amount ?? 0.12, 0.0, 0.6);

  return cfg;
}

function ensureVolumeState(ctx) {
  if (!ctx.volumeState) {
    ctx.volumeState = {
      backgroundMesh: null,
      glowMesh: null,
      backgroundMaterial: null,
      glowMaterial: null,
      uniforms: null,
    };
  }
  return ctx.volumeState;
}

export function ensureVolumeConfig(ctx) {
  if (!ctx.volumeConfig) ctx.volumeConfig = { ...DEFAULT_VOLUME_CONFIG };
  else
    ctx.volumeConfig = mergeDeep(
      { ...DEFAULT_VOLUME_CONFIG },
      ctx.volumeConfig,
    );

  const cfg = normalizeConfig(ctx.volumeConfig);
  const qualityProfile = getQualityProfileFromContext(ctx, 'high');
  cfg.backgroundStrength = Math.min(cfg.backgroundStrength, qualityProfile.volumetricBackgroundStrength);
  cfg.glowIntensity = Math.min(cfg.glowIntensity, qualityProfile.glowIntensityMax);
  return cfg;
}

function toColor(input, fallback) {
  try {
    if (input?.isColor) return input.clone();
    return new THREE.Color(input ?? fallback);
  } catch (_) {
    return new THREE.Color(fallback);
  }
}

/* ------------------------ Shaders ------------------------ */
const BG_VERTEX = /* glsl */ `
  varying vec3 vViewDir;
  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`;

const BG_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uLightColor;
  uniform float uStrength;
  uniform float uVignette;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseAmount;
  varying vec3 vViewDir;

  float hash(vec3 p){
    p = fract(p * 0.3183099 + vec3(.1,.1,.1));
    p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
  }

  float noise(vec3 p){
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float n000 = hash(i + vec3(0,0,0));
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  void main() {
    float center = clamp(dot(normalize(vViewDir), vec3(0.0, 0.0, -1.0)), 0.0, 1.0);
    float falloff = pow(center, 1.45);
    float edge = pow(1.0 - center, uVignette);

    vec3 p = normalize(vViewDir) * uNoiseScale + vec3(0.0, 0.0, uTime * 0.15);
    float n = noise(p) * 2.0 - 1.0;
    float n2 = noise(p * 1.7 + 8.0) * 2.0 - 1.0;
    float organic = (n * 0.65 + n2 * 0.35);

    float intensity = mix(0.46, 1.0, falloff);
    intensity *= (1.0 - edge * 0.34);
    intensity *= (1.0 + organic * uNoiseAmount);

    vec3 col = uLightColor * uStrength * intensity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uSoftness;
  uniform float uTime;
  uniform float uNoiseScale;
  uniform float uNoiseAmount;
  varying vec2 vUv;

  float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p);

    float n = noise(p * uNoiseScale + uTime * 0.22) * 2.0 - 1.0;
    float n2 = noise(p * (uNoiseScale * 1.7) + uTime * 0.14 + 10.0) * 2.0 - 1.0;
    float organic = (n * 0.65 + n2 * 0.35) * uNoiseAmount;

    float edge = 0.5 - uSoftness - organic;
    float alpha = smoothstep(0.5, edge, d);
    alpha = pow(alpha, 2.15);

    vec3 col = uColor * uIntensity;
    gl_FragColor = vec4(col, alpha * uIntensity);
  }
`;

export function buildVolume(ctx) {
  const cfg = ensureVolumeConfig(ctx);
  const qualityProfile = getQualityProfileFromContext(ctx, 'high');

  cfg.backgroundStrength = Math.min(
    cfg.backgroundStrength,
    qualityProfile.volumetricBackgroundStrength,
  );
  cfg.glowIntensity = Math.min(
    cfg.glowIntensity,
    qualityProfile.glowIntensityMax,
  );
  const state = ensureVolumeState(ctx);

  if (state.backgroundMesh) {
    state.backgroundMesh.parent?.remove(state.backgroundMesh);
    state.backgroundMesh.geometry?.dispose();
    state.backgroundMaterial?.dispose();
    state.backgroundMesh = null;
  }
  if (state.glowMesh) {
    state.glowMesh.parent?.remove(state.glowMesh);
    state.glowMesh.geometry?.dispose();
    state.glowMaterial?.dispose();
    state.glowMesh = null;
  }

  const bgUniforms = {
    uLightColor: { value: toColor(cfg.backgroundColor, 0x111111) },
    uStrength: { value: cfg.backgroundStrength },
    uVignette: { value: cfg.vignette },
    uTime: { value: 0 },
    uNoiseScale: { value: cfg.noise.scale },
    uNoiseAmount: { value: cfg.noise.amount },
  };

  const bgMaterial = new THREE.ShaderMaterial({
    uniforms: bgUniforms,
    vertexShader: BG_VERTEX,
    fragmentShader: BG_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });

  const bgGeometry = new THREE.SphereGeometry(1, 48, 32);
  const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
  bgMesh.name = 'ReactiveBackground';
  bgMesh.renderOrder = -10;
  bgMesh.userData.renderAuditCategory = 'volume-background';
  bgMesh.scale.setScalar(cfg.scale);
  ctx.scene.add(bgMesh);

  const glowUniforms = {
    uColor: { value: toColor(cfg.glowColor, 0xffffff) },
    uIntensity: { value: cfg.glowIntensity },
    uSoftness: { value: cfg.softness },
    uTime: { value: 0 },
    uNoiseScale: { value: cfg.noise.scale },
    uNoiseAmount: { value: cfg.noise.amount },
  };

  const glowMaterial = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const glowGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  glowMesh.name = 'OrbGlow';
  glowMesh.renderOrder = 5;
  glowMesh.userData.renderAuditCategory = 'volume-glow';
  glowMesh.scale.setScalar(cfg.glowSize);
  ctx.scene.add(glowMesh);

  state.backgroundMesh = bgMesh;
  state.glowMesh = glowMesh;
  state.backgroundMaterial = bgMaterial;
  state.glowMaterial = glowMaterial;
  state.uniforms = { bg: bgUniforms, glow: glowUniforms };

  return state;
}

export function updateVolumeForFrame(ctx, time = 0) {
  const state = ensureVolumeState(ctx);

  if (ctx.runtimeFlags?.emergencyMode) {
    if (state.backgroundMesh) state.backgroundMesh.visible = false;
    if (state.glowMesh) state.glowMesh.visible = false;
    return;
  }

  const cfg = ensureVolumeConfig(ctx);
  const qualityProfile = getQualityProfileFromContext(ctx, 'high');

  cfg.backgroundStrength = Math.min(
    cfg.backgroundStrength,
    qualityProfile.volumetricBackgroundStrength,
  );
  cfg.glowIntensity = Math.min(
    cfg.glowIntensity,
    qualityProfile.glowIntensityMax,
  );
  if (!state.backgroundMesh || !state.glowMesh) buildVolume(ctx);
  if (!state.backgroundMesh || !state.glowMesh) return;

  state.backgroundMesh.visible = !!cfg.enabled;
  state.glowMesh.visible = !!cfg.enabled;

  const mainLight = ctx.lightsRegistry?.get('sun-main')?.light;
  const lightColor = mainLight?.color
    ? mainLight.color
    : toColor(cfg.backgroundColor, 0x111111);
  const strengthBoost = mainLight?.intensity
    ? Math.min(1.25, Math.max(0.9, mainLight.intensity / 5.2))
    : 1.0;

  const noiseSpeed = cfg.noise?.speed ?? 0.18;

  if (state.uniforms?.bg) {
    state.uniforms.bg.uLightColor.value.copy(lightColor);
    state.uniforms.bg.uStrength.value = Math.min(
      cfg.backgroundStrength * strengthBoost,
      qualityProfile.volumetricBackgroundStrength,
    );
    state.uniforms.bg.uVignette.value = cfg.vignette;
    state.uniforms.bg.uTime.value = time * noiseSpeed;
    state.uniforms.bg.uNoiseScale.value = cfg.noise.scale;
    state.uniforms.bg.uNoiseAmount.value = cfg.noise.amount;
  }

  const pulse = 1 + Math.sin(time * cfg.glowPulseSpeed) * cfg.glowPulseAmp;
  const glowSize = cfg.glowSize * pulse;
  state.glowMesh.scale.set(glowSize, glowSize, glowSize);

  if (ctx.camera && ctx.orbGroup) {
    state.glowMesh.position.copy(ctx.orbGroup.position);
    state.glowMesh.quaternion.copy(ctx.camera.quaternion);
    state.glowMesh.translateZ(-3.0);
  }

  if (state.uniforms?.glow) {
    state.uniforms.glow.uColor.value.copy(
      toColor(cfg.glowColor ?? cfg.backgroundColor, 0xffffff),
    );
    state.uniforms.glow.uIntensity.value = Math.min(
      cfg.glowIntensity *
        (0.8 + Math.sin(time * cfg.glowPulseSpeed) * cfg.glowPulseAmp),
      qualityProfile.glowIntensityMax,
    );
    state.uniforms.glow.uSoftness.value = cfg.softness;
    state.uniforms.glow.uTime.value = time * noiseSpeed;
    state.uniforms.glow.uNoiseScale.value = cfg.noise.scale;
    state.uniforms.glow.uNoiseAmount.value = cfg.noise.amount;
  }
}

export function setVolumeConfig(ctx, patch = {}) {
  const cfg = ensureVolumeConfig(ctx);
  const qualityProfile = getQualityProfileFromContext(ctx, 'high');

  cfg.backgroundStrength = Math.min(
    cfg.backgroundStrength,
    qualityProfile.volumetricBackgroundStrength,
  );
  cfg.glowIntensity = Math.min(
    cfg.glowIntensity,
    qualityProfile.glowIntensityMax,
  );
  mergeDeep(cfg, patch);
  normalizeConfig(cfg);

  const rebuild = !!patch.forceRebuild;
  if (rebuild || !ctx.volumeState?.backgroundMesh || !ctx.volumeState?.glowMesh)
    buildVolume(ctx);
  return cfg;
}

export const buildReactiveVolume = buildVolume;
export const updateReactiveVolumeForFrame = updateVolumeForFrame;

const orbVolumesApi = {
  ensureVolumeConfig,
  buildVolume,
  buildReactiveVolume,
  updateVolumeForFrame,
  updateReactiveVolumeForFrame,
  setVolumeConfig,
};

export default orbVolumesApi;
