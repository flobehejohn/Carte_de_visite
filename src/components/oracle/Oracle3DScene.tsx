import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  ORB_BASE_RENDER_LAYER,
  ORB_OVERLAY_RENDER_LAYER,
  ensureFluidParticlesConfig,
  resetFluidParticles,
} from '../../scene/modules/orbFluidParticles.js';
import { getLightsSnapshot } from '../../scene/modules/orbLighting';
import {
  getQualityProfileFromContext,
  writeQualitySnapshotToContext,
} from '../../scene/performance/QualityGovernor';
import { RitualOrchestrator } from '../../scene/RitualOrchestrator';
import { LightSafetyGovernor } from '../../scene/safety/LightSafetyGovernor';
import { getOracleTextLength } from '../../services/zarathustraService';
import { orbError, orbLog, orbWarn } from '../../shared/debug/orbDebug';

interface Oracle3DSceneProps {
  formData: any;
  stage: number;
  loading: boolean;
  result: any;
  progress?: number;
}

type RenderMode = 'composer-bloom' | 'composer-no-bloom' | 'direct';

type RenderTargetTextureRef = {
  label: string;
  uuid: string;
  texture: THREE.Texture;
};

type FeedbackCandidate = {
  objectName: string;
  objectType: string;
  objectUuid: string;
  instanced: boolean;
  materialName: string;
  materialType: string;
  textureSource: string;
  textureUuid: string;
  renderTargetLabel: string;
  renderTargetUuid: string;
};

type SceneGraphMetrics = {
  type: string;
  count: number;
};

type SceneResources = {
  renderer?: THREE.WebGLRenderer;
  composer?: EffectComposer;
  scene?: THREE.Scene;
  camera?: THREE.Camera;
  orchestrator?: RitualOrchestrator | null;
  frameId?: number;
  handleResize?: (() => void) | null;
  handleContextLost?: ((event: Event) => void) | null;
  rendererDom?: HTMLCanvasElement;
  container?: HTMLDivElement | null;
  disposeCallback?: (() => void) | null;
};

type DrawableObject = THREE.Object3D & {
  material?: THREE.Material | THREE.Material[];
  geometry?: THREE.BufferGeometry;
  isMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isLineSegments?: boolean;
  isLineLoop?: boolean;
  isSprite?: boolean;
  isInstancedMesh?: boolean;
};

type RenderTelemetryInfo = {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
};

type SceneStats = {
  rendererCalls: number;
  triangles: number;
  points: number;
  lines: number;
  baseRendererCalls: number;
  baseTriangles: number;
  basePoints: number;
  baseLines: number;
  overlayRendererCalls: number;
  overlayTriangles: number;
  overlayPoints: number;
  overlayLines: number;
  lastFrameMode: RenderMode | null;
  framesRendered: number;
  baseVisibleDrawables: number;
  overlayVisibleDrawables: number;
  totalVisibleDrawables: number;
  baseVisibleDrawablesExcludingProbe: number;
  overlayVisibleDrawablesExcludingProbe: number;
  totalVisibleDrawablesExcludingProbe: number;
  orbGroupChildren: number;
  layersGroupChildren: number;
  orbRootVisibleDrawables: number;
  layersGroupVisibleDrawables: number;
  orbGroupVisible: boolean | null;
  layersGroupVisible: boolean | null;
  fluidMeshVisible: boolean;
  particlesPointsVisible: boolean;
  fluidMeshLayerMask: number | null;
  particlesPointsLayerMask: number | null;
  sceneChildren: number;
  cameraLayerMask: number | null;
  probePresent: boolean;
  probeVisible: boolean;
  hasRenderableContent: boolean;
};

type EmergencyVisualState = {
  active: boolean;
  fog: THREE.FogExp2 | null;
  toneMappingExposure: number | null;
  cameraPosition: THREE.Vector3 | null;
  volumeBackgroundVisible: boolean | null;
  volumeGlowVisible: boolean | null;
  foregroundVisible: boolean | null;
};

type UiWindowAudit = {
  renderMode: string;
  visibleSafeMode: boolean;
  layers: {
    base: number;
    overlay: number;
  };
  resolution: {
    w: number;
    h: number;
    pixelRatio: number;
  };
  postprocessing: {
    composerExists: boolean;
    activePasses: string[];
    bloomEnabled: boolean;
    bloomParams?: {
      threshold: number;
      strength: number;
      radius: number;
    };
  };
  renderer: {
    localClippingEnabled: boolean;
    shadowMapEnabled: boolean;
    toneMapping: number;
  };
  sceneGraph: SceneGraphMetrics[];
};

type FluidParticlesConfigType = {
  enabled?: boolean;
  color?: string;
  count?: number;
  size?: number;
  excludeFromComposer?: boolean;
  renderLayer?: number;
  opacityMul?: number;
};

type FrameWindowStats = {
  sampleCount: number;
  meanFrameTime: number | null;
  worstFrameTime: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avgFpsWindow: number | null;
};

type RuntimeCounters = {
  resetCount: number;
  reinitCount: number;
};

const MATERIAL_TEXTURE_KEYS = [
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'emissiveMap',
  'envMap',
  'gradientMap',
  'lightMap',
  'matcap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'specularMap',
  'transmissionMap',
  'thicknessMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
] as const;

const FRAME_WINDOW_MAX_SAMPLES = 180;

function materialArray(
  material: THREE.Material | THREE.Material[] | undefined,
): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function disposeMaterial(material: THREE.Material): void {
  const dict = material as unknown as Record<string, unknown>;

  for (const key of MATERIAL_TEXTURE_KEYS) {
    const value = dict[key];
    if (value && typeof value === 'object' && 'isTexture' in (value as any)) {
      (value as THREE.Texture).dispose?.();
    }
  }

  if ('uniforms' in material) {
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    if (uniforms) {
      for (const uniform of Object.values(uniforms)) {
        const texture = (uniform as any)?.value;
        if (texture && typeof texture === 'object' && 'isTexture' in texture) {
          (texture as THREE.Texture).dispose?.();
        }
      }
    }
  }

  material.dispose?.();
}

function disposeObjectGraph(scene: THREE.Scene): void {
  scene.traverse((obj: any) => {
    obj.geometry?.dispose?.();
    for (const material of materialArray(obj.material)) {
      disposeMaterial(material);
    }
  });
}

function isTexture(value: unknown): value is THREE.Texture {
  return Boolean(
    value && typeof value === 'object' && 'isTexture' in (value as any),
  );
}

function isRenderTarget(value: unknown): value is THREE.WebGLRenderTarget {
  return Boolean(
    value && typeof value === 'object' && 'isRenderTarget' in (value as any),
  );
}

function pushRenderTargetTexture(
  refs: RenderTargetTextureRef[],
  label: string,
  renderTarget: unknown,
): void {
  if (!isRenderTarget(renderTarget)) return;
  const texture = renderTarget.texture;
  if (!texture?.uuid) return;
  refs.push({
    label,
    uuid: texture.uuid,
    texture,
  });
}

function collectNestedRenderTargets(
  value: unknown,
  label: string,
  refs: RenderTargetTextureRef[],
  seen: WeakSet<object>,
  depth = 0,
): void {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value as object)) return;
  if (depth > 3) return;

  seen.add(value as object);

  if (isRenderTarget(value)) {
    pushRenderTargetTexture(refs, label, value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      collectNestedRenderTargets(
        entry,
        `${label}[${index}]`,
        refs,
        seen,
        depth + 1,
      );
    });
    return;
  }

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (key === 'uniforms') continue;
    collectNestedRenderTargets(
      nested,
      `${label}.${key}`,
      refs,
      seen,
      depth + 1,
    );
  }
}

function dedupeRenderTargetTextures(
  refs: RenderTargetTextureRef[],
): RenderTargetTextureRef[] {
  const seen = new Set<string>();
  const out: RenderTargetTextureRef[] = [];

  for (const ref of refs) {
    const key = `${ref.label}|${ref.uuid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }

  return out;
}

function collectComposerTargetTextures(
  composer: EffectComposer,
  bloomPass: UnrealBloomPass,
): RenderTargetTextureRef[] {
  const refs: RenderTargetTextureRef[] = [];
  const anyComposer = composer as any;

  pushRenderTargetTexture(refs, 'composer.readBuffer', anyComposer.readBuffer);
  pushRenderTargetTexture(
    refs,
    'composer.writeBuffer',
    anyComposer.writeBuffer,
  );
  pushRenderTargetTexture(
    refs,
    'composer.renderTarget1',
    anyComposer.renderTarget1,
  );
  pushRenderTargetTexture(
    refs,
    'composer.renderTarget2',
    anyComposer.renderTarget2,
  );

  collectNestedRenderTargets(
    bloomPass as unknown,
    'bloomPass',
    refs,
    new WeakSet<object>(),
  );

  return dedupeRenderTargetTextures(refs);
}

function collectMaterialTextures(
  material: THREE.Material,
): Array<{ source: string; texture: THREE.Texture }> {
  const refs: Array<{ source: string; texture: THREE.Texture }> = [];
  const dict = material as unknown as Record<string, unknown>;

  for (const key of MATERIAL_TEXTURE_KEYS) {
    const value = dict[key];
    if (isTexture(value)) {
      refs.push({ source: key, texture: value });
    }
  }

  if ('uniforms' in material) {
    const uniforms = (material as THREE.ShaderMaterial).uniforms;
    if (uniforms) {
      for (const [uniformName, uniform] of Object.entries(uniforms)) {
        const value = (uniform as any)?.value;
        if (isTexture(value)) {
          refs.push({
            source: `uniforms.${uniformName}`,
            texture: value,
          });
        }
      }
    }
  }

  return refs;
}

function objectLabel(obj: THREE.Object3D): string {
  return obj.name?.trim() || `${obj.type}:${obj.uuid.slice(0, 8)}`;
}

function objectUsesLayer(
  obj: THREE.Object3D | null | undefined,
  layer: number,
): boolean {
  if (!obj?.layers) return false;
  const mask = 1 << layer;
  return (obj.layers.mask & mask) === mask;
}

function resolveLayerMaskForSnapshot(
  explicitMask: number | null | undefined,
  fallbackLayer: number | null | undefined,
): number | null {
  if (typeof explicitMask === 'number') return explicitMask;
  if (typeof fallbackLayer !== 'number') return null;
  return 1 << fallbackLayer;
}

function ensureOverlayFluidIsolationConfig(localCtx: any) {
  ensureFluidParticlesConfig(localCtx);
  localCtx.fluidParticlesConfig.excludeFromComposer = true;
  localCtx.fluidParticlesConfig.renderLayer = ORB_OVERLAY_RENDER_LAYER;
  return localCtx.fluidParticlesConfig;
}

function findFeedbackCandidates(
  scene: THREE.Scene,
  composer: EffectComposer,
  bloomPass: UnrealBloomPass,
): FeedbackCandidate[] {
  const renderTargetTextures = collectComposerTargetTextures(
    composer,
    bloomPass,
  );
  if (renderTargetTextures.length === 0) return [];

  const byUuid = new Map(
    renderTargetTextures.map((entry) => [entry.uuid, entry] as const),
  );

  const matches: FeedbackCandidate[] = [];

  scene.traverse((obj: any) => {
    if (obj?.userData?.postprocessIsolation === true) return;
    if (!objectUsesLayer(obj, ORB_BASE_RENDER_LAYER)) return;

    const materials = materialArray(obj.material);
    if (materials.length === 0) return;

    for (const material of materials) {
      const textureRefs = collectMaterialTextures(material);

      for (const textureRef of textureRefs) {
        const targetRef = byUuid.get(textureRef.texture.uuid);
        if (!targetRef) continue;

        matches.push({
          objectName: objectLabel(obj),
          objectType: obj.type ?? 'Object3D',
          objectUuid: obj.uuid ?? 'unknown',
          instanced: Boolean(obj.isInstancedMesh),
          materialName:
            material.name || `${material.type}:${material.uuid.slice(0, 8)}`,
          materialType: material.type,
          textureSource: textureRef.source,
          textureUuid: textureRef.texture.uuid,
          renderTargetLabel: targetRef.label,
          renderTargetUuid: targetRef.uuid,
        });
      }
    }
  });

  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = [
      match.objectUuid,
      match.materialName,
      match.textureSource,
      match.renderTargetUuid,
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function snapshotCandidateSignature(candidates: FeedbackCandidate[]): string {
  return JSON.stringify(
    candidates.map((item) => [
      item.objectName,
      item.materialName,
      item.textureSource,
      item.renderTargetLabel,
      item.textureUuid,
    ]),
  );
}

function isDrawableObject(
  obj: THREE.Object3D | null | undefined,
): obj is DrawableObject {
  const drawable = obj as DrawableObject | null | undefined;
  if (!drawable || drawable.visible === false) return false;

  return Boolean(
    drawable.isMesh ||
    drawable.isPoints ||
    drawable.isLine ||
    drawable.isLineSegments ||
    drawable.isLineLoop ||
    drawable.isSprite ||
    drawable.isInstancedMesh,
  );
}

function countVisibleDrawables(
  root: THREE.Object3D | null | undefined,
): number {
  if (!root) return 0;

  let count = 0;
  root.traverse((obj) => {
    if (!isDrawableObject(obj)) return;
    if (obj.name === '__DEV_VISIBLE_PROBE__') return;
    count += 1;
  });

  return count;
}

function readRendererTelemetry(
  renderer: THREE.WebGLRenderer,
): RenderTelemetryInfo {
  const renderInfo = renderer.info.render as Record<string, unknown>;
  return {
    calls: Number(renderInfo.calls || 0),
    triangles: Number(renderInfo.triangles || 0),
    points: Number(renderInfo.points || 0),
    lines: Number(renderInfo.lines || 0),
  };
}

function sumRenderTelemetry(
  base: RenderTelemetryInfo | null,
  overlay: RenderTelemetryInfo | null,
): RenderTelemetryInfo {
  return {
    calls: Number(base?.calls || 0) + Number(overlay?.calls || 0),
    triangles: Number(base?.triangles || 0) + Number(overlay?.triangles || 0),
    points: Number(base?.points || 0) + Number(overlay?.points || 0),
    lines: Number(base?.lines || 0) + Number(overlay?.lines || 0),
  };
}

function safeGetRendererPixelRatio(renderer: THREE.WebGLRenderer): number {
  const candidate = (renderer as any)?.getPixelRatio;
  if (typeof candidate === 'function') {
    try {
      const value = Number(candidate.call(renderer));
      if (Number.isFinite(value) && value > 0) return value;
    } catch {
      // noop
    }
  }

  return 1;
}

function safeGetRendererSize(renderer: THREE.WebGLRenderer): {
  w: number;
  h: number;
} {
  const candidate = (renderer as any)?.getSize;
  if (typeof candidate === 'function') {
    try {
      const size = new THREE.Vector2();
      candidate.call(renderer, size);
      if (Number.isFinite(size.x) && Number.isFinite(size.y)) {
        return { w: size.x, h: size.y };
      }
    } catch {
      // noop
    }
  }

  const canvas = renderer.domElement;
  return {
    w: Number(canvas?.width || canvas?.clientWidth || 0),
    h: Number(canvas?.height || canvas?.clientHeight || 0),
  };
}

function percentile(sorted: number[], ratio: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  const value = sorted[index];
  return Number.isFinite(value) ? value : null;
}

function computeFrameWindowStats(samples: number[]): FrameWindowStats {
  const valid = samples.filter((value) => Number.isFinite(value) && value >= 0);
  if (valid.length === 0) {
    return {
      sampleCount: 0,
      meanFrameTime: null,
      worstFrameTime: null,
      p50: null,
      p95: null,
      p99: null,
      avgFpsWindow: null,
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((acc, value) => acc + value, 0);
  const meanFrameTime = sum / valid.length;
  const worstFrameTime = sorted[sorted.length - 1];
  const avgFpsWindow = meanFrameTime > 0 ? 1000 / meanFrameTime : null;

  return {
    sampleCount: valid.length,
    meanFrameTime,
    worstFrameTime,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    avgFpsWindow,
  };
}

function estimateProfileCost(input: {
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  dpr: number;
  bloomEnabled: boolean;
  fogEnabled: boolean;
  fluidParticleCount: number;
}): number {
  const primitiveScore =
    input.triangles / 150_000 + input.points / 80_000 + input.lines / 60_000;

  const drawCallScore = input.drawCalls / 250;
  const dprScore = Math.max(0, input.dpr - 1);
  const bloomScore = input.bloomEnabled ? 0.75 : 0;
  const fogScore = input.fogEnabled ? 0.15 : 0;
  const fluidScore = input.fluidParticleCount / 15_000;

  const total =
    drawCallScore +
    primitiveScore +
    dprScore +
    bloomScore +
    fogScore +
    fluidScore;

  return Number(total.toFixed(3));
}

function collectSceneStats(
  scene: THREE.Scene,
  localCtx: any,
  renderTelemetry: {
    base: RenderTelemetryInfo | null;
    overlay: RenderTelemetryInfo | null;
    total: RenderTelemetryInfo | null;
    mode: RenderMode | null;
    framesRendered: number;
  },
): SceneStats {
  let baseVisibleDrawables = 0;
  let overlayVisibleDrawables = 0;
  let totalVisibleDrawables = 0;
  let baseVisibleDrawablesExcludingProbe = 0;
  let overlayVisibleDrawablesExcludingProbe = 0;
  let totalVisibleDrawablesExcludingProbe = 0;
  let probePresent = false;
  let probeVisible = false;

  scene.traverse((obj) => {
    const isProbe = obj.name === '__DEV_VISIBLE_PROBE__';
    if (isProbe) {
      probePresent = true;
      probeVisible = obj.visible !== false;
    }

    if (!isDrawableObject(obj)) return;

    totalVisibleDrawables += 1;
    if (!isProbe) {
      totalVisibleDrawablesExcludingProbe += 1;
    }

    if (objectUsesLayer(obj, ORB_BASE_RENDER_LAYER)) {
      baseVisibleDrawables += 1;
      if (!isProbe) {
        baseVisibleDrawablesExcludingProbe += 1;
      }
    }

    if (objectUsesLayer(obj, ORB_OVERLAY_RENDER_LAYER)) {
      overlayVisibleDrawables += 1;
      if (!isProbe) {
        overlayVisibleDrawablesExcludingProbe += 1;
      }
    }
  });

  const totalTelemetry = renderTelemetry.total || {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
  };
  const baseTelemetry = renderTelemetry.base || {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
  };
  const overlayTelemetry = renderTelemetry.overlay || {
    calls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
  };

  const rendererCalls = Number(totalTelemetry.calls || 0);
  const triangles = Number(totalTelemetry.triangles || 0);
  const points = Number(totalTelemetry.points || 0);
  const lines = Number(totalTelemetry.lines || 0);
  const primitiveCount = triangles + points + lines;

  return {
    rendererCalls,
    triangles,
    points,
    lines,
    baseRendererCalls: Number(baseTelemetry.calls || 0),
    baseTriangles: Number(baseTelemetry.triangles || 0),
    basePoints: Number(baseTelemetry.points || 0),
    baseLines: Number(baseTelemetry.lines || 0),
    overlayRendererCalls: Number(overlayTelemetry.calls || 0),
    overlayTriangles: Number(overlayTelemetry.triangles || 0),
    overlayPoints: Number(overlayTelemetry.points || 0),
    overlayLines: Number(overlayTelemetry.lines || 0),
    lastFrameMode: renderTelemetry.mode,
    framesRendered: renderTelemetry.framesRendered,
    baseVisibleDrawables,
    overlayVisibleDrawables,
    totalVisibleDrawables,
    baseVisibleDrawablesExcludingProbe,
    overlayVisibleDrawablesExcludingProbe,
    totalVisibleDrawablesExcludingProbe,
    orbGroupChildren: localCtx.orbGroup?.children?.length ?? 0,
    layersGroupChildren: localCtx.layersGroup?.children?.length ?? 0,
    orbRootVisibleDrawables: countVisibleDrawables(localCtx.orbGroup),
    layersGroupVisibleDrawables: countVisibleDrawables(localCtx.layersGroup),
    orbGroupVisible:
      typeof localCtx.orbGroup?.visible === 'boolean'
        ? localCtx.orbGroup.visible
        : null,
    layersGroupVisible:
      typeof localCtx.layersGroup?.visible === 'boolean'
        ? localCtx.layersGroup.visible
        : null,
    fluidMeshVisible: Boolean(localCtx.fluidParticlesState?.mesh?.visible),
    particlesPointsVisible: Boolean(localCtx.particlesPoints?.visible),
    fluidMeshLayerMask: resolveLayerMaskForSnapshot(
      localCtx.fluidParticlesState?.mesh?.layers?.mask,
      localCtx.fluidParticlesConfig?.renderLayer ?? ORB_OVERLAY_RENDER_LAYER,
    ),
    particlesPointsLayerMask: resolveLayerMaskForSnapshot(
      localCtx.particlesPoints?.layers?.mask,
      localCtx.fluidParticlesConfig?.renderLayer ?? ORB_OVERLAY_RENDER_LAYER,
    ),
    sceneChildren: scene.children.length,
    cameraLayerMask:
      typeof localCtx.camera?.layers?.mask === 'number'
        ? localCtx.camera.layers.mask
        : null,
    probePresent,
    probeVisible,
    hasRenderableContent:
      rendererCalls > 0 ||
      primitiveCount > 0 ||
      totalVisibleDrawablesExcludingProbe > 0,
  };
}

function resolveRenderMode(
  composer: EffectComposer | null,
  bloomPass: UnrealBloomPass | null,
): RenderMode {
  if (!composer) return 'direct';
  if (!bloomPass) return 'composer-no-bloom';
  return 'composer-bloom';
}

function resolvePassName(pass: any): string {
  if (!pass) return 'unknown';
  if (pass instanceof RenderPass) return 'RenderPass';
  if (pass instanceof UnrealBloomPass) return 'UnrealBloomPass';
  return pass.constructor?.name || 'unknown';
}

function collectActivePasses(composer: EffectComposer | null): string[] {
  const passes = (composer as any)?.passes;
  if (!composer || !Array.isArray(passes)) return [];
  return passes
    .filter((p: any) => p?.enabled)
    .map((p: any) => resolvePassName(p));
}

function countSceneGraphTypes(scene: THREE.Scene): SceneGraphMetrics[] {
  const counts = new Map<string, number>();
  scene.traverse((obj) => {
    const t = obj.type || 'Object3D';
    counts.set(t, (counts.get(t) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([type, count]) => ({
    type,
    count,
  }));
}

function buildUiWindowAudit(
  renderer: THREE.WebGLRenderer,
  composer: EffectComposer | null,
  bloomPass: UnrealBloomPass | null,
  scene: THREE.Scene,
  visibleSafeMode: boolean,
): UiWindowAudit {
  const size = safeGetRendererSize(renderer);

  return {
    renderMode: resolveRenderMode(composer, bloomPass),
    visibleSafeMode,
    layers: {
      base: ORB_BASE_RENDER_LAYER,
      overlay: ORB_OVERLAY_RENDER_LAYER,
    },
    resolution: {
      w: size.w,
      h: size.h,
      pixelRatio: safeGetRendererPixelRatio(renderer),
    },
    postprocessing: {
      composerExists: composer !== null,
      activePasses: collectActivePasses(composer),
      bloomEnabled: bloomPass !== null && bloomPass.enabled,
      bloomParams: bloomPass
        ? {
            threshold: (bloomPass as any).threshold,
            strength: (bloomPass as any).strength,
            radius: (bloomPass as any).radius,
          }
        : undefined,
    },
    renderer: {
      localClippingEnabled: renderer.localClippingEnabled,
      shadowMapEnabled: renderer.shadowMap.enabled,
      toneMapping: renderer.toneMapping,
    },
    sceneGraph: countSceneGraphTypes(scene),
  };
}

function createVisibleSafeMaterial(
  obj: DrawableObject,
  _sourceMaterial: THREE.Material,
): THREE.Material {
  const brightMeshColor = 0xff00ff;
  const brightLineColor = 0x00ffff;

  if (obj.isPoints) {
    return new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.4,
      sizeAttenuation: true,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      fog: false,
    });
  }

  if (obj.isLine || obj.isLineSegments || obj.isLineLoop) {
    return new THREE.LineBasicMaterial({
      color: brightLineColor,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true,
      fog: false,
    });
  }

  return new THREE.MeshBasicMaterial({
    color: brightMeshColor,
    wireframe: true,
    transparent: false,
    opacity: 1,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: false,
  });
}

function createVisibleSafeMaterialSet(
  obj: DrawableObject,
  original: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  if (Array.isArray(original)) {
    return original.map((material) => createVisibleSafeMaterial(obj, material));
  }
  return createVisibleSafeMaterial(obj, original);
}

function disposeTransientMaterials(
  current: THREE.Material | THREE.Material[] | undefined,
  original: THREE.Material | THREE.Material[] | undefined,
): void {
  const originalSet = new Set(materialArray(original));

  for (const material of materialArray(current)) {
    if (originalSet.has(material)) continue;
    disposeMaterial(material);
  }
}

function flagMaterialNeedsUpdate(
  material: THREE.Material | THREE.Material[] | undefined,
): void {
  for (const entry of materialArray(material)) {
    entry.needsUpdate = true;
  }
}

function parseCssZIndex(value: string | null | undefined): number | null {
  if (!value || value === 'auto') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mountDevVisibleProbe(scene: THREE.Scene) {
  const geometry = new THREE.IcosahedronGeometry(1.45, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
    transparent: false,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const probe = new THREE.Mesh(geometry, material);
  probe.name = '__DEV_VISIBLE_PROBE__';
  probe.position.set(0, 0, 2.5);
  probe.scale.setScalar(2.2);
  probe.renderOrder = 9999;
  probe.frustumCulled = false;
  probe.layers.set(ORB_BASE_RENDER_LAYER);
  scene.add(probe);

  return () => {
    scene.remove(probe);
    geometry.dispose();
    material.dispose();
  };
}

function cloneFogExp2(
  fog: THREE.FogExp2 | null | undefined,
): THREE.FogExp2 | null {
  if (!fog || !fog.isFogExp2) return null;
  return new THREE.FogExp2(fog.color.clone(), fog.density);
}

const AUDIT_RUNTIME_ENABLED =
  import.meta.env.DEV ||
  import.meta.env.MODE === 'test' ||
  import.meta.env.VITE_ENABLE_ORB_AUDIT === 'true';

export function Oracle3DScene({
  formData,
  stage,
  loading,
  result,
  progress,
}: Oracle3DSceneProps) {
  void progress;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orchestratorRef = useRef<RitualOrchestrator | null>(null);
  const webGLFailureRef = useRef(false);
  const [webGLFailed, setWebGLFailed] = useState(false);
  const frameIdRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const initRitualRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderModeRef = useRef<RenderMode>('composer-bloom');
  const feedbackCandidatesRef = useRef<FeedbackCandidate[]>([]);
  const feedbackSignatureRef = useRef<string>('');
  const autoFallbackOnFeedbackRef = useRef<boolean>(true);
  const visibleSafeModeRef = useRef<boolean>(false);
  const originalMaterialsRef = useRef<
    WeakMap<object, THREE.Material | THREE.Material[]>
  >(new WeakMap());
  const emergencyProbeDisposeRef = useRef<(() => void) | null>(null);
  const emergencyVisualStateRef = useRef<EmergencyVisualState>({
    active: false,
    fog: null,
    toneMappingExposure: null,
    cameraPosition: null,
    volumeBackgroundVisible: null,
    volumeGlowVisible: null,
    foregroundVisible: null,
  });
  const scanFeedbackCandidatesRef = useRef<
    (reason?: string) => FeedbackCandidate[]
  >(() => []);
  const resetSceneViewRef = useRef<(reason?: string) => void>(() => {});
  const applyVisibleSafeModeRef = useRef<(enabled: boolean) => void>(() => {});
  const lastRitualSeedRef = useRef<string>('');
  const busyCycleRef = useRef(false);
  const baseRenderTelemetryRef = useRef<RenderTelemetryInfo | null>(null);
  const overlayRenderTelemetryRef = useRef<RenderTelemetryInfo | null>(null);
  const lastFrameModeRef = useRef<RenderMode | null>(null);
  const renderedFramesRef = useRef(0);
  const frameWindowRef = useRef<number[]>([]);
  const runtimeCountersRef = useRef<RuntimeCounters>({
    resetCount: 0,
    reinitCount: 0,
  });

  const lastTimeRef = useRef<number>(0);
  const clockRef = useRef(new THREE.Clock());

  useEffect(() => {
    if (webGLFailureRef.current) return;
    if (!containerRef.current) return;

    const setOverlayMessage = (message: string | null) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      if (!message) {
        overlay.textContent = 'WebGL context lost';
        overlay.classList.add('hidden');
        overlay.classList.remove('flex');
        return;
      }

      overlay.textContent = message;
      overlay.classList.remove('hidden');
      overlay.classList.add('flex');
    };

    const disposeSceneResources = (refs: SceneResources | null | undefined) => {
      if (!refs) return;

      cancelAnimationFrame(refs.frameId || 0);

      refs.rendererDom?.removeEventListener?.(
        'webglcontextlost',
        refs.handleContextLost as EventListener,
        false,
      );

      if (refs.handleResize) {
        window.removeEventListener('resize', refs.handleResize);
      }

      refs.disposeCallback?.();
      refs.composer?.dispose?.();
      refs.renderer?.dispose?.();

      if (refs.scene) {
        disposeObjectGraph(refs.scene);
      }

      if (refs.rendererDom && refs.container?.contains(refs.rendererDom)) {
        refs.container.removeChild(refs.rendererDom);
      }
    };

    if (AUDIT_RUNTIME_ENABLED && (window as any).__ORB_ACTIVE_SCENE__) {
      disposeSceneResources((window as any).__ORB_ACTIVE_SCENE__);
      (window as any).__ORB_ACTIVE_SCENE__ = null;
    }

    let activeRefs: SceneResources | null = null;
    let disposeProbe: (() => void) | null = null;

    const scene = new THREE.Scene();
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x111624, 0.003);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 8);
    camera.layers.set(ORB_BASE_RENDER_LAYER);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      webGLFailureRef.current = true;
      orbWarn(
        'Oracle3DScene',
        'Impossible de créer le contexte WebGL. Bascule en mode lecture statique.',
        { key: 'oracle3d:webgl-init-fail' },
        error,
      );
      setWebGLFailed(true);
      return;
    }

    renderer.setClearColor(0x111624, 1.0);
    renderer.autoClear = false;
    renderer.localClippingEnabled = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.6;
    const baseExposure = renderer.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if ('outputColorSpace' in renderer) {
      (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    }

    containerRef.current.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      position: 'absolute',
      inset: '0',
    });

    let contextLost = false;
    const handleContextLost = (event: Event) => {
      event.preventDefault?.();
      contextLost = true;
      orbWarn('AUDIT', 'WebGL context lost', {
        key: 'audit:webgl-context-lost',
      });
      setOverlayMessage('WebGL context lost');
    };

    renderer.domElement.addEventListener(
      'webglcontextlost',
      handleContextLost,
      false,
    );

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      0.9,
      0.4,
      0.85,
    );

    const renderTarget = new THREE.WebGLRenderTarget(256, 256, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    const composer = new EffectComposer(renderer, renderTarget);
    (composer as any).renderToScreen = true;
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const ctx: any = {
      scene,
      camera,
      renderer,
      composer,
      renderScene,
      bloomPass,
      orbGroup: new THREE.Group(),
      lightsGroup: new THREE.Group(),
      layersGroup: new THREE.Group(),
      orbLayers: [],
      wireFrames: [],
      lightsRegistry: new Map(),
      clipPlanesState: [],
      orbShellConfig: {
        radius: 2.2,
        detail: 1,
        shapeType: 'icosa',
        baseDeformAmplitude: 0,
        pulseAmplitude: 0,
        noiseFrequency1: 1,
        noiseFrequency2: 1,
        noiseFrequency3: 1,
      },
      layersConfig: { count: 1, spacing: { x: 0, y: 0, z: 0.45 } },
      wireConfig: { enabled: true, color: 0xffd700, opacity: 0.5 },
      clippingConfig: { enabled: false, planeConstant: 0, showHelpers: false },
      clipPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.8)],
      ensureOrbMaterial: () =>
        new THREE.MeshStandardMaterial({
          color: 0x8a9ba8,
          roughness: 0.4,
          metalness: 0.6,
          side: THREE.DoubleSide,
        }),
      baseExposure,
      contextLostFlag: () => contextLost,
      renderModeRef,
      feedbackCandidatesRef,
      runtimeFlags: {
        emergencyMode: false,
      },
      runtimeTelemetry: {
        frameWindowMs: frameWindowRef.current,
        counters: runtimeCountersRef.current,
        snapshotVersion: 'scene-rich-v3',
      },
    };

    ensureOverlayFluidIsolationConfig(ctx);

    scene.add(ctx.orbGroup);
    ctx.orbGroup.add(ctx.layersGroup);
    scene.add(ctx.lightsGroup);

    const lightSafetyGovernor = new LightSafetyGovernor();
    lightSafetyGovernor.attach({
      renderer,
      bloomPass,
      scene,
      getBudgetSignals: () => {
        const orch: any = orchestratorRef.current;
        const state = orch?.currentState;
        return {
          keyIntensity: state?.lightKey,
          fillIntensity: state?.lightFill,
          rimIntensity: state?.rim,
          glowIntensity: ctx.volumeConfig?.glowIntensity,
          backgroundStrength: ctx.volumeConfig?.backgroundStrength,
          wireOpacity: state?.wireOpacity,
          particlesOpacity: ctx.particlesConfig?.opacity,
        };
      },
    });
    ctx.lightSafetyGovernor = lightSafetyGovernor;

    const orchestrator = new RitualOrchestrator(ctx);
    orchestratorRef.current = orchestrator;
    if (ctx.qualityGovernor) {
      writeQualitySnapshotToContext(ctx, ctx.qualityGovernor);
    }

    const callInitRitual = (seed: string) => {
      runtimeCountersRef.current.reinitCount += 1;
      orchestrator.initRitual(seed);
    };

    const applyVisibleSafeMode = (enabled: boolean) => {
      const localCtx = (orchestratorRef.current as any)?.ctx;
      if (!localCtx?.scene) return;

      localCtx.scene.traverse((obj: THREE.Object3D) => {
        const drawable = obj as DrawableObject;
        if (!isDrawableObject(drawable)) return;
        if (!drawable.material) return;
        if (drawable.name === '__DEV_VISIBLE_PROBE__') return;

        if (enabled) {
          if (!originalMaterialsRef.current.has(drawable)) {
            originalMaterialsRef.current.set(drawable, drawable.material);
          }

          const originalMaterial = originalMaterialsRef.current.get(drawable);
          if (!originalMaterial) return;

          disposeTransientMaterials(drawable.material, originalMaterial);
          drawable.material = createVisibleSafeMaterialSet(
            drawable,
            originalMaterial,
          );
          flagMaterialNeedsUpdate(drawable.material);
          return;
        }

        const originalMaterial = originalMaterialsRef.current.get(drawable);
        if (!originalMaterial) return;

        disposeTransientMaterials(drawable.material, originalMaterial);
        drawable.material = originalMaterial;
        flagMaterialNeedsUpdate(drawable.material);
      });

      visibleSafeModeRef.current = Boolean(enabled);
      orbLog(
        'AUDIT',
        'setVisibleSafeMode',
        { audit: true, key: 'audit:setVisibleSafeMode' },
        visibleSafeModeRef.current,
      );
    };

    applyVisibleSafeModeRef.current = applyVisibleSafeMode;

    const rememberEmergencyVisualState = (localCtx: any) => {
      if (!localCtx?.scene || emergencyVisualStateRef.current.active) return;

      const volumeState = localCtx.volumeState || {};
      emergencyVisualStateRef.current = {
        active: true,
        fog: cloneFogExp2(localCtx.scene.fog as THREE.FogExp2 | null),
        toneMappingExposure:
          typeof localCtx.renderer?.toneMappingExposure === 'number'
            ? localCtx.renderer.toneMappingExposure
            : null,
        cameraPosition: localCtx.camera?.position?.clone?.() ?? null,
        volumeBackgroundVisible:
          typeof volumeState.backgroundMesh?.visible === 'boolean'
            ? volumeState.backgroundMesh.visible
            : null,
        volumeGlowVisible:
          typeof volumeState.glowMesh?.visible === 'boolean'
            ? volumeState.glowMesh.visible
            : null,
        foregroundVisible:
          typeof (orchestratorRef.current as any)?.foregroundMesh?.visible ===
          'boolean'
            ? (orchestratorRef.current as any).foregroundMesh.visible
            : null,
      };
    };

    const applyEmergencyVisualMode = (localCtx: any) => {
      if (!localCtx?.scene) return;

      rememberEmergencyVisualState(localCtx);

      localCtx.runtimeFlags.emergencyMode = true;

      if (localCtx.renderer) {
        localCtx.renderer.setClearColor(0x334455, 1.0);
        localCtx.renderer.toneMappingExposure = 2.2;
      }
      localCtx.scene.fog = null;

      const volumeState = localCtx.volumeState || {};
      if (volumeState.backgroundMesh)
        volumeState.backgroundMesh.visible = false;
      if (volumeState.glowMesh) volumeState.glowMesh.visible = false;

      if ((orchestratorRef.current as any)?.foregroundMesh) {
        (orchestratorRef.current as any).foregroundMesh.visible = false;
      }

      if (localCtx.orbMesh) {
        localCtx.orbMesh.visible = true;
      }

      if (Array.isArray(localCtx.wireFrames)) {
        localCtx.wireFrames.forEach((wire: any) => {
          if (wire) {
            wire.visible = true;
          }
        });
      }
    };

    const restoreEmergencyVisualMode = (localCtx: any) => {
      const previous = emergencyVisualStateRef.current;
      if (!localCtx?.scene || !previous.active) return;

      localCtx.runtimeFlags.emergencyMode = false;

      if (localCtx.renderer) {
        localCtx.renderer.setClearColor(0x111624, 1.0);
        if (typeof previous.toneMappingExposure === 'number') {
          localCtx.renderer.toneMappingExposure = previous.toneMappingExposure;
        }
      }

      localCtx.scene.fog = previous.fog ? cloneFogExp2(previous.fog) : null;

      const volumeState = localCtx.volumeState || {};
      if (
        volumeState.backgroundMesh &&
        previous.volumeBackgroundVisible !== null
      ) {
        volumeState.backgroundMesh.visible = previous.volumeBackgroundVisible;
      }
      if (volumeState.glowMesh && previous.volumeGlowVisible !== null) {
        volumeState.glowMesh.visible = previous.volumeGlowVisible;
      }

      if (
        (orchestratorRef.current as any)?.foregroundMesh &&
        previous.foregroundVisible !== null
      ) {
        (orchestratorRef.current as any).foregroundMesh.visible =
          previous.foregroundVisible;
      }

      if (localCtx.camera?.position && previous.cameraPosition) {
        localCtx.camera.position.copy(previous.cameraPosition);
        localCtx.camera.lookAt?.(0, 0, 0);
        localCtx.camera.updateProjectionMatrix?.();
      }

      emergencyVisualStateRef.current = {
        active: false,
        fog: null,
        toneMappingExposure: null,
        cameraPosition: null,
        volumeBackgroundVisible: null,
        volumeGlowVisible: null,
        foregroundVisible: null,
      };
    };

    if (!initRitualRef.current) {
      callInitRitual('');
      initRitualRef.current = true;
    }

    const resetSceneView = (reason = 'manual') => {
      const localCtx = (orchestratorRef.current as any)?.ctx;
      if (!localCtx) return;

      runtimeCountersRef.current.resetCount += 1;
      frameCountRef.current = 0;
      feedbackCandidatesRef.current = [];
      feedbackSignatureRef.current = '';
      renderModeRef.current = 'composer-bloom';
      autoFallbackOnFeedbackRef.current = true;
      baseRenderTelemetryRef.current = null;
      overlayRenderTelemetryRef.current = null;
      lastFrameModeRef.current = null;
      renderedFramesRef.current = 0;
      frameWindowRef.current = [];

      ensureOverlayFluidIsolationConfig(localCtx);
      resetFluidParticles(localCtx);
      setOverlayMessage(null);

      if (emergencyVisualStateRef.current.active) {
        applyEmergencyVisualMode(localCtx);
      } else {
        restoreEmergencyVisualMode(localCtx);
      }

      localCtx.camera?.layers?.set?.(ORB_BASE_RENDER_LAYER);

      if (visibleSafeModeRef.current) {
        applyVisibleSafeModeRef.current(true);
      }

      orbLog(
        'AUDIT',
        'resetSceneView',
        {
          audit: true,
          key: `audit:resetSceneView:${reason}`,
        },
        reason,
      );
      scanFeedbackCandidatesRef.current(`reset:${reason}`);
    };

    resetSceneViewRef.current = resetSceneView;

    const scanFeedbackCandidates = (reason = 'manual'): FeedbackCandidate[] => {
      try {
        const candidates = findFeedbackCandidates(scene, composer, bloomPass);
        feedbackCandidatesRef.current = candidates;

        const signature = snapshotCandidateSignature(candidates);
        if (signature !== feedbackSignatureRef.current) {
          feedbackSignatureRef.current = signature;

          if (candidates.length > 0) {
            orbWarn(
              'AUDIT',
              `render-target feedback risk detected (${reason})`,
              { key: `audit:feedback-risk:${reason}`, throttleMs: 1500 },
              candidates,
            );
          } else {
            orbLog(
              'AUDIT',
              `no render-target feedback candidates (${reason})`,
              {
                audit: true,
                key: `audit:no-feedback:${reason}`,
                throttleMs: 1500,
              },
            );
          }
        }

        if (
          candidates.length > 0 &&
          autoFallbackOnFeedbackRef.current &&
          renderModeRef.current !== 'direct'
        ) {
          renderModeRef.current = 'direct';
          orbWarn(
            'AUDIT',
            'switching render mode to direct to bypass WebGL feedback risk',
            { key: 'audit:fallback-direct-feedback-risk', throttleMs: 2000 },
          );
        }

        return candidates;
      } catch (error) {
        orbWarn(
          'AUDIT',
          'feedback scan failed',
          {
            key: 'audit:feedback-scan-failed',
            throttleMs: 1500,
          },
          error,
        );
        return feedbackCandidatesRef.current;
      }
    };

    scanFeedbackCandidatesRef.current = scanFeedbackCandidates;

    activeRefs = {
      renderer,
      composer,
      scene,
      camera,
      orchestrator,
      frameId: 0,
      handleResize: null,
      handleContextLost,
      rendererDom: renderer.domElement,
      container: containerRef.current,
      disposeCallback: () => {
        emergencyProbeDisposeRef.current?.();
        emergencyProbeDisposeRef.current = null;
        applyVisibleSafeModeRef.current(false);
        disposeProbe?.();
        disposeProbe = null;
        ctx.lightSafetyGovernor?.dispose?.();
      },
    };

    if (AUDIT_RUNTIME_ENABLED) {
      (window as any).__ORB_ACTIVE_SCENE__ = activeRefs;
    }

    if (
      import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      (window as any).__ORB_DEBUG_VISIBLE_PROBE__ === true
    ) {
      disposeProbe = mountDevVisibleProbe(scene);
    }

    if (AUDIT_RUNTIME_ENABLED) {
      const colorToHex = (c: unknown) => {
        try {
          const cc = c as any;
          if (cc && typeof cc === 'object' && 'isColor' in cc && cc.isColor) {
            return `#${cc.getHexString()}`;
          }
          if (typeof c === 'string') return c;
          if (typeof c === 'number') {
            return `#${new THREE.Color(c).getHexString()}`;
          }
        } catch {
          // noop
        }
        return null;
      };

      const colorToHsl = (c: unknown) => {
        try {
          const cc = c as any;
          const col =
            cc && typeof cc === 'object' && 'isColor' in cc && cc.isColor
              ? cc
              : new THREE.Color(c as any);

          const hsl = { h: 0, s: 0, l: 0 };
          col.getHSL(hsl);
          return { h: hsl.h, s: hsl.s, l: hsl.l };
        } catch {
          return null;
        }
      };

      const serializeColors = (obj: unknown): any => {
        if (!obj || typeof obj !== 'object') return obj;

        const out: any = Array.isArray(obj) ? [] : {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (typeof v === 'function') continue;

          const vv = v as any;

          if (vv && typeof vv === 'object' && 'isColor' in vv && vv.isColor) {
            out[k] = { hex: colorToHex(vv), hsl: colorToHsl(vv) };
            continue;
          }

          if (Array.isArray(v)) {
            out[k] = v.map((x) => {
              const xx = x as any;
              if (
                xx &&
                typeof xx === 'object' &&
                'isColor' in xx &&
                xx.isColor
              ) {
                return { hex: colorToHex(xx), hsl: colorToHsl(xx) };
              }
              return serializeColors(x);
            });
            continue;
          }

          if (v && typeof v === 'object') {
            out[k] = serializeColors(v);
            continue;
          }

          out[k] = v;
        }

        return out;
      };

      const snapshot = () => {
        try {
          const warnings: string[] = [];
          const orch = orchestratorRef.current;
          if (!orch) return { warnings: ['orchestrator missing'] };

          const localCtx = (orch as any).ctx || {};
          ensureFluidParticlesConfig(localCtx);

          const orbShell = {
            present: !!localCtx.orbMesh,
            visible: !!localCtx.orbMesh?.visible,
            frustumCulled: localCtx.orbMesh?.frustumCulled ?? null,
            renderOrder: localCtx.orbMesh?.renderOrder ?? null,
            layerMask: localCtx.orbMesh?.layers?.mask ?? null,
            materialType: localCtx.orbMesh?.material?.type ?? null,
            auditCategory:
              localCtx.orbMesh?.userData?.renderAuditCategory ?? null,
            wireframeCount: localCtx.wireFrames?.length ?? 0,
            visibleWireframeCount:
              localCtx.wireFrames?.filter((w: any) => w.visible).length ?? 0,
          };

          if (orbShell.present) {
            if (orbShell.auditCategory !== 'orb-solid') {
              warnings.push('orb-shell-missing-audit-category');
            }
            if (orbShell.layerMask !== 1) {
              warnings.push('orb-shell-invalid-layer');
            }
            if (orbShell.frustumCulled !== false) {
              warnings.push('orb-shell-invalid-culling');
            }
          } else {
            warnings.push('orb-shell-missing');
          }

          if (emergencyVisualStateRef.current.active) {
            if (
              orbShell.wireframeCount > 0 &&
              orbShell.visibleWireframeCount === 0
            ) {
              warnings.push('emergency-mode-no-visible-wireframes');
            }
          }

          const lights = getLightsSnapshot
            ? getLightsSnapshot(localCtx as any)
            : [];

          const volumeConfig = localCtx.volumeConfig
            ? serializeColors(localCtx.volumeConfig)
            : null;
          const particlesConfig = localCtx.particlesConfig
            ? serializeColors(localCtx.particlesConfig)
            : null;
          const fluidParticlesConfig = localCtx.fluidParticlesConfig
            ? serializeColors(localCtx.fluidParticlesConfig)
            : null;
          const genome = localCtx.ritualGenome
            ? serializeColors(localCtx.ritualGenome)
            : null;
          const state = (orch as any).currentState
            ? serializeColors((orch as any).currentState)
            : null;
          const climateTargets = localCtx.climateTargets
            ? serializeColors(localCtx.climateTargets)
            : null;

          const safetyFactor =
            typeof localCtx.appliedSafetyFactor === 'number'
              ? localCtx.appliedSafetyFactor
              : typeof localCtx.safetyFactor === 'number'
                ? localCtx.safetyFactor
                : null;

          const appliedFogDensity =
            typeof localCtx.appliedFogDensity === 'number'
              ? localCtx.appliedFogDensity
              : null;

          const appliedBloomStrength =
            typeof localCtx.appliedBloomStrength === 'number'
              ? localCtx.appliedBloomStrength
              : null;

          const appliedVignette =
            typeof localCtx.appliedVignette === 'number'
              ? localCtx.appliedVignette
              : null;

          const appliedOpacityMuls = {
            wireOpacityMul:
              typeof localCtx.appliedOpacityWireMul === 'number'
                ? localCtx.appliedOpacityWireMul
                : null,
            particlesOpacityMul:
              typeof localCtx.appliedOpacityParticlesMul === 'number'
                ? localCtx.appliedOpacityParticlesMul
                : null,
            foregroundOpacity:
              typeof localCtx.appliedOpacityForeground === 'number'
                ? localCtx.appliedOpacityForeground
                : null,
          };

          const rendererInfo = {
            base: baseRenderTelemetryRef.current,
            overlay: overlayRenderTelemetryRef.current,
            total: sumRenderTelemetry(
              baseRenderTelemetryRef.current,
              overlayRenderTelemetryRef.current,
            ),
            mode: lastFrameModeRef.current,
            framesRendered: renderedFramesRef.current,
          };

          if (localCtx.contextLostFlag && localCtx.contextLostFlag()) {
            warnings.push('webgl context lost');
          }

          const fluidState = {
            rebuildCount: Number(
              localCtx.fluidParticlesState?.rebuildCount ?? 0,
            ),
            meshVisible: Boolean(
              localCtx.fluidParticlesState?.mesh?.visible ??
              localCtx.particlesPoints?.visible ??
              false,
            ),
            configEnabled: Boolean(
              localCtx.fluidParticlesConfig?.enabled ?? true,
            ),
          };

          const particlesRuntime = (() => {
            const pw: string[] = [];
            const res: any = {};

            if (!localCtx.particlesConfig) {
              pw.push('particlesConfig missing');
              return { warnings: pw };
            }

            res.mode = localCtx.particlesConfig.mode || null;
            res.count =
              localCtx.particlesPoints?.geometry?.getAttribute?.('position')
                ?.count ||
              localCtx.particlesConfig.count ||
              null;
            res.size = localCtx.particlesConfig.size ?? null;
            res.linkDistance = localCtx.particlesConfig.linkDistance ?? null;
            res.dynamics = localCtx.particlesConfig.dynamics || null;
            res.style =
              localCtx.ritualGenome?.geometry?.particleStyle ||
              localCtx.ritualDNA?.particleStyle ||
              null;
            res.overlayLayer = ORB_OVERLAY_RENDER_LAYER;
            res.baseLayer = ORB_BASE_RENDER_LAYER;

            if (
              typeof res.linkDistance === 'number' &&
              (res.linkDistance < 0 || res.linkDistance > 10)
            ) {
              pw.push('linkDistance out of range');
            }

            if (
              typeof res.size === 'number' &&
              (res.size < 0 || res.size > 5)
            ) {
              pw.push('particle size out of range');
            }

            res.warnings = pw;
            return res;
          })();

          const volumeEffective = (() => {
            if (!localCtx.volumeConfig) return null;
            return {
              smokePolicyState:
                localCtx.smokePolicyState ??
                localCtx.smokePolicy?.state ??
                localCtx.climateTargets?.smoke?.state ??
                localCtx.volumeEffective?.smokePolicyState ??
                localCtx.volumeEffective?.smokeState ??
                null,
              smokeCompensation:
                localCtx.smokeCompensation ??
                localCtx.smokePolicy?.compensation ??
                localCtx.climateTargets?.smoke?.compensation ??
                localCtx.volumeEffective?.smokeCompensation ??
                null,
              backgroundStrength: localCtx.volumeConfig.backgroundStrength,
              glowIntensity: localCtx.volumeConfig.glowIntensity,
              softness: localCtx.volumeConfig.softness,
              vignette: localCtx.volumeConfig.vignette,
              noise: {
                scale: (localCtx.volumeConfig as any).noiseScale ?? null,
                speed: (localCtx.volumeConfig as any).noiseSpeed ?? null,
                amount: (localCtx.volumeConfig as any).noiseAmount ?? null,
              },
            };
          })();

          const numCheck = (
            label: string,
            v: any,
            min: number,
            max: number,
          ) => {
            if (
              typeof v === 'number' &&
              (Number.isNaN(v) || v < min || v > max)
            ) {
              warnings.push(`${label} out of range`);
            }
            if (typeof v === 'number' && !Number.isFinite(v)) {
              warnings.push(`${label} NaN/Inf`);
            }
          };

          numCheck('softness', localCtx.volumeConfig?.softness, 0, 2);
          numCheck(
            'backgroundStrength',
            localCtx.volumeConfig?.backgroundStrength,
            0,
            5,
          );
          numCheck('glowIntensity', localCtx.volumeConfig?.glowIntensity, 0, 5);

          if (particlesRuntime?.warnings?.length) {
            warnings.push(...particlesRuntime.warnings);
          }

          const nanCheck = (label: string, v: any) => {
            if (typeof v === 'number' && Number.isNaN(v)) {
              warnings.push(`${label} NaN`);
            }
          };

          nanCheck('state.lightIntensity', state?.lightIntensity);
          nanCheck('state.bloomStrength', state?.bloomStrength);
          nanCheck('state.glowIntensity', state?.glowIntensity);
          nanCheck(
            'volumeEffective.backgroundStrength',
            volumeEffective?.backgroundStrength,
          );
          nanCheck(
            'volumeEffective.glowIntensity',
            volumeEffective?.glowIntensity,
          );

          const uiWindow = buildUiWindowAudit(
            renderer,
            composer,
            bloomPass,
            scene,
            visibleSafeModeRef.current,
          ) as UiWindowAudit & Record<string, unknown>;

          if (scene.fog) {
            (uiWindow as any).fog = {
              type: (scene.fog as any).isFogExp2 ? 'FogExp2' : 'Fog',
              enabled: true,
              density: (scene.fog as any).density ?? null,
              near: (scene.fog as any).near ?? null,
              far: (scene.fog as any).far ?? null,
              color: colorToHex((scene.fog as any).color) || null,
            };
            numCheck('fogDensity', (scene.fog as any).density, 0, 2);
          } else {
            (uiWindow as any).fog = {
              enabled: false,
              density: null,
              near: null,
              far: null,
              color: null,
              note: 'fog missing',
            };
            warnings.push('fog missing');
          }

          uiWindow.renderMode = renderModeRef.current;
          (uiWindow as any).autoFallbackOnFeedback =
            autoFallbackOnFeedbackRef.current;
          uiWindow.visibleSafeMode = visibleSafeModeRef.current;
          (uiWindow as any).emergencyVisibleMode =
            emergencyVisualStateRef.current.active;
          (uiWindow as any).feedbackCandidates = feedbackCandidatesRef.current;
          (uiWindow as any).layers = {
            composerBase: ORB_BASE_RENDER_LAYER,
            overlay: ORB_OVERLAY_RENDER_LAYER,
          };

          if (localCtx.bloomPass) {
            (uiWindow as any).blur = {
              type: 'bloom-proxy',
              enabled:
                renderModeRef.current !== 'direct' &&
                renderModeRef.current !== 'composer-no-bloom' &&
                !!localCtx.bloomPass.strength &&
                localCtx.bloomPass.strength > 0,
              strength: localCtx.bloomPass.strength ?? null,
              threshold: (localCtx.bloomPass as any).threshold ?? null,
              radius: (localCtx.bloomPass as any).radius ?? null,
              note: 'proxy bloom on base layer only',
            };
          } else {
            (uiWindow as any).blur = {
              type: 'none',
              enabled: false,
              radius: null,
              strength: null,
              note: 'blur not provided',
            };
          }

          const collectTranslucidity = () => {
            const materials: THREE.Material[] = [];
            const root = localCtx.orbGroup || localCtx.layersGroup;
            if (!root) return null;

            root.traverse?.((obj: any) => {
              for (const material of materialArray(obj?.material)) {
                materials.push(material);
              }
            });

            if (!materials.length) return null;

            let sumT = 0;
            let sumO = 0;
            let sumTh = 0;
            let sumR = 0;
            let sumM = 0;
            let minT = Infinity;
            let maxT = -Infinity;
            let minO = Infinity;
            let maxO = -Infinity;
            let minTh = Infinity;
            let maxTh = -Infinity;
            let count = 0;
            let roughnessCount = 0;
            let metalnessCount = 0;

            materials.forEach((m: any) => {
              const t = typeof m.transmission === 'number' ? m.transmission : 0;
              const o = typeof m.opacity === 'number' ? m.opacity : 1;
              const th = typeof m.thickness === 'number' ? m.thickness : 0;
              const r = typeof m.roughness === 'number' ? m.roughness : null;
              const me = typeof m.metalness === 'number' ? m.metalness : null;

              sumT += t;
              sumO += o;
              sumTh += th;
              if (r !== null) {
                sumR += r;
                roughnessCount += 1;
              }
              if (me !== null) {
                sumM += me;
                metalnessCount += 1;
              }

              minT = Math.min(minT, t);
              maxT = Math.max(maxT, t);
              minO = Math.min(minO, o);
              maxO = Math.max(maxO, o);
              minTh = Math.min(minTh, th);
              maxTh = Math.max(maxTh, th);
              count += 1;

              if (t > 1 || t < 0) warnings.push('transmission out of range');
              if (o > 1 || o < 0) warnings.push('opacity out of range');
            });

            if (!count) return null;

            return {
              enabled: count > 0,
              samples: count,
              avgTransmission: sumT / count,
              avgOpacity: sumO / count,
              avgThickness: sumTh / count,
              minTransmission: minT,
              maxTransmission: maxT,
              minOpacity: minO,
              maxOpacity: maxO,
              minThickness: minTh,
              maxThickness: maxTh,
              avgRoughness: roughnessCount > 0 ? sumR / roughnessCount : null,
              avgMetalness: metalnessCount > 0 ? sumM / metalnessCount : null,
            };
          };

          (uiWindow as any).translucidity = collectTranslucidity() || {
            enabled: false,
            transmission: null,
            opacity: null,
            thickness: null,
            note: 'no translucent materials',
          };

          (uiWindow as any).postprocess = {
            bloomStrength: localCtx.bloomPass?.strength ?? null,
            toneMapping: localCtx.renderer?.toneMapping ?? null,
            toneMappingExposure:
              (localCtx.renderer as any)?.toneMappingExposure ?? null,
            vignette: localCtx.volumeConfig?.vignette ?? null,
          };

          numCheck('bloomStrength', localCtx.bloomPass?.strength, 0, 8);

          if (feedbackCandidatesRef.current.length > 0) {
            warnings.push('render-target-feedback-risk');
          }

          if (emergencyVisualStateRef.current.active) {
            if (scene.fog) warnings.push('emergency-mode-fog-restored');
            if (localCtx.volumeState?.backgroundMesh?.visible) {
              warnings.push('emergency-mode-bg-restored');
            }
            if (localCtx.volumeState?.glowMesh?.visible) {
              warnings.push('emergency-mode-glow-restored');
            }
            if ((orchestratorRef.current as any)?.foregroundMesh?.visible) {
              warnings.push('emergency-mode-foreground-restored');
            }
          }

          const sceneStats = collectSceneStats(scene, localCtx, rendererInfo);
          if (sceneStats.rendererCalls <= 0) {
            warnings.push('rendererCalls<=0');
          }
          if (
            sceneStats.triangles + sceneStats.points + sceneStats.lines <=
            0
          ) {
            warnings.push('no rendered primitives yet');
          }
          if (
            sceneStats.baseVisibleDrawablesExcludingProbe +
              sceneStats.overlayVisibleDrawablesExcludingProbe <=
            0
          ) {
            warnings.push('no visible drawables registered');
          }
          if (sceneStats.baseVisibleDrawablesExcludingProbe <= 0) {
            warnings.push('base layer has no visible drawables');
          }

          const dom = (() => {
            const rootEl = rootRef.current;
            const containerEl = containerRef.current;
            const parentEl = rootEl?.parentElement ?? null;
            const rootStyle = rootEl ? window.getComputedStyle(rootEl) : null;
            const parentStyle = parentEl
              ? window.getComputedStyle(parentEl)
              : null;
            const rootRect = rootEl?.getBoundingClientRect?.();
            const containerRect = containerEl?.getBoundingClientRect?.();
            const rootZIndex = parseCssZIndex(rootStyle?.zIndex);
            const parentZIndex = parseCssZIndex(parentStyle?.zIndex);

            if (rootZIndex !== null && rootZIndex < 0) {
              warnings.push('scene root negative z-index');
            }

            return {
              rootZIndex,
              rootPosition: rootStyle?.position ?? null,
              rootIsolation: rootStyle?.isolation ?? null,
              rootPointerEvents: rootStyle?.pointerEvents ?? null,
              rootOpacity: rootStyle?.opacity ?? null,
              rootVisibility: rootStyle?.visibility ?? null,
              parentZIndex,
              parentPosition: parentStyle?.position ?? null,
              parentIsolation: parentStyle?.isolation ?? null,
              parentOverflow: parentStyle?.overflow ?? null,
              rootRect: rootRect
                ? {
                    width: rootRect.width,
                    height: rootRect.height,
                    top: rootRect.top,
                    left: rootRect.left,
                  }
                : null,
              containerRect: containerRect
                ? {
                    width: containerRect.width,
                    height: containerRect.height,
                    top: containerRect.top,
                    left: containerRect.left,
                  }
                : null,
              canvasClient: renderer.domElement
                ? {
                    width: renderer.domElement.clientWidth,
                    height: renderer.domElement.clientHeight,
                  }
                : null,
              canvasWidth: renderer.domElement?.width ?? null,
              canvasHeight: renderer.domElement?.height ?? null,
              canvasAttached: Boolean(
                renderer.domElement &&
                containerEl?.contains(renderer.domElement),
              ),
            };
          })();

          const frameStats = computeFrameWindowStats(frameWindowRef.current);
          const totalRender = rendererInfo.total || {
            calls: 0,
            triangles: 0,
            points: 0,
            lines: 0,
          };

          const rendererSize = safeGetRendererSize(renderer);
          const dpr = safeGetRendererPixelRatio(renderer);
          const bloomEnabled =
            renderModeRef.current !== 'direct' &&
            renderModeRef.current !== 'composer-no-bloom' &&
            Boolean(localCtx.bloomPass?.enabled);
          const fogEnabled = Boolean(scene.fog);
          const fogDensity =
            scene.fog && 'density' in scene.fog
              ? ((scene.fog as any).density ?? null)
              : null;
          const fluidParticleCount =
            Number(
              localCtx.fluidParticlesState?.mesh?.geometry?.getAttribute?.(
                'position',
              )?.count ??
                localCtx.particlesPoints?.geometry?.getAttribute?.('position')
                  ?.count ??
                localCtx.fluidParticlesConfig?.count ??
                0,
            ) || 0;

          const runtimeQuality = localCtx.runtime?.quality ?? null;

          const activeQualityProfile =
            runtimeQuality?.activeProfile ??
            localCtx.activeQualityProfile ??
            localCtx.qualityProfile ??
            localCtx.runtimeFlags?.activeQualityProfile ??
            'unknown';

          const forcedQualityProfile =
            runtimeQuality?.forcedProfile ??
            localCtx.forcedQualityProfile ??
            localCtx.runtimeFlags?.forcedQualityProfile ??
            null;

          const autoDetectedQualityProfile =
            runtimeQuality?.autoDetectedProfile ??
            localCtx.autoDetectedQualityProfile ??
            null;

          const qualityProfileSource =
            runtimeQuality?.source ??
            localCtx.qualityProfileSource ??
            'unknown';

          const qualityDprBucket =
            runtimeQuality?.dprBucket ??
            localCtx.dprBucket ??
            localCtx.runtimeTelemetry?.qualityProfiles?.dprBucket ??
            (typeof dpr === 'number' && Number.isFinite(dpr)
              ? dpr >= 2.5
                ? 'ultra'
                : dpr >= 1.5
                  ? 'high'
                  : 'normal'
              : null);

          const qualityRendererWidth =
            typeof localCtx.runtimeTelemetry?.rendererSize?.w === 'number'
              ? localCtx.runtimeTelemetry.rendererSize.w
              : typeof localCtx.runtimeTelemetry?.rendererSize?.width === 'number'
                ? localCtx.runtimeTelemetry.rendererSize.width
                : typeof localCtx.renderer?.domElement?.width === 'number'
                  ? localCtx.renderer.domElement.width
                  : null;

          const qualityRendererHeight =
            typeof localCtx.runtimeTelemetry?.rendererSize?.h === 'number'
              ? localCtx.runtimeTelemetry.rendererSize.h
              : typeof localCtx.runtimeTelemetry?.rendererSize?.height === 'number'
                ? localCtx.runtimeTelemetry.rendererSize.height
                : typeof localCtx.renderer?.domElement?.height === 'number'
                  ? localCtx.renderer.domElement.height
                  : null;

          const qualityRendererArea =
            typeof localCtx.rendererArea === 'number'
              ? localCtx.rendererArea
              : typeof runtimeQuality?.rendererArea === 'number'
                ? runtimeQuality.rendererArea
                : typeof localCtx.runtimeTelemetry?.qualityProfiles?.rendererArea === 'number'
                  ? localCtx.runtimeTelemetry.qualityProfiles.rendererArea
                  : typeof qualityRendererWidth === 'number' && typeof qualityRendererHeight === 'number'
                    ? Math.max(0, Math.round(qualityRendererWidth * qualityRendererHeight))
                    : null;

          const qualityDeviceClass =
            runtimeQuality?.deviceClass ??
            localCtx.deviceClass ??
            localCtx.runtimeTelemetry?.qualityProfiles?.deviceClass ??
            (typeof qualityRendererWidth === 'number' && typeof qualityRendererHeight === 'number'
              ? (() => {
                  const minSide = Math.min(qualityRendererWidth, qualityRendererHeight);
                  const maxSide = Math.max(qualityRendererWidth, qualityRendererHeight);
                  if (minSide <= 480) return 'mobile';
                  if (minSide <= 900 && maxSide <= 1180) return 'tablet';
                  return 'desktop';
                })()
              : null);
          const estimatedProfileCost =
            typeof runtimeQuality?.estimatedCost === 'number'
              ? runtimeQuality.estimatedCost
              : typeof localCtx.estimatedProfileCost === 'number'
                ? localCtx.estimatedProfileCost
                : estimateProfileCost({
                    drawCalls: Number(totalRender.calls || 0),
                    triangles: Number(totalRender.triangles || 0),
                    points: Number(totalRender.points || 0),
                    lines: Number(totalRender.lines || 0),
                    dpr,
                    bloomEnabled,
                    fogEnabled,
                    fluidParticleCount,
                  });

          const orchestratorTimings = (() => {
            const rawTimings =
              localCtx.runtimeTelemetry?.orchestratorTimings || {};
            const toFiniteNumber = (value: any) => {
              const num = Number(value);
              return Number.isFinite(num) ? Math.max(0, num) : 0;
            };

            return {
              climateMs: toFiniteNumber(rawTimings.climateMs),
              applyTargetsMs: toFiniteNumber(rawTimings.applyTargetsMs),
              motionMs: toFiniteNumber(rawTimings.motionMs),
              geometryMs: toFiniteNumber(rawTimings.geometryMs),
              materialsMs: toFiniteNumber(rawTimings.materialsMs),
              lightsMs: toFiniteNumber(rawTimings.lightsMs),
              volumeMs: toFiniteNumber(rawTimings.volumeMs),
              particlesMs: toFiniteNumber(rawTimings.particlesMs),
              fluidMs: toFiniteNumber(rawTimings.fluidMs),
              textMs: toFiniteNumber(rawTimings.textMs),
              auditBridgeMs: toFiniteNumber(rawTimings.auditBridgeMs),
              totalUpdateMs: toFiniteNumber(rawTimings.totalUpdateMs),
            };
          })();

          const fluidMetrics = (() => {
            const rawState = localCtx.fluidParticlesState || {};
            const mesh = rawState.mesh;
            const toFiniteNumberOrNull = (value: any) => {
              const num = Number(value);
              return Number.isFinite(num) ? Math.max(0, num) : null;
            };

            return {
              activeParticleCount: Number(rawState.activeParticleCount ?? 0),
              updateCount: Number(rawState.updateCount ?? 0),
              lastUpdateMs: toFiniteNumberOrNull(rawState.lastUpdateMs),
              avgUpdateMs: toFiniteNumberOrNull(rawState.avgUpdateMs),
              rebuildCount: Number(rawState.rebuildCount ?? 0),
              meshCapacity: Number(rawState.meshCapacity ?? 0),
              targetMaxCount: Number(rawState.targetMaxCount ?? 0),
              appliedMaxCount: Number(rawState.appliedMaxCount ?? 0),
              lastProfileApplied:
                rawState.lastProfileApplied === null ||
                rawState.lastProfileApplied === undefined
                  ? null
                  : String(rawState.lastProfileApplied),
              enabled: Boolean(localCtx.fluidParticlesConfig?.enabled ?? true),
              visible: Boolean(
                mesh?.visible ?? fluidState.meshVisible ?? false,
              ),
              fallbackWarning: Boolean(rawState.fallbackWarning ?? false),
              fallbackHits: Number(rawState.fallbackHits ?? 0),
              particlePoolSize: Number(rawState.particles?.length ?? 0),
              meshCount: Number(mesh?.count ?? 0),
              renderLayer:
                typeof localCtx.fluidParticlesConfig?.renderLayer === 'number'
                  ? localCtx.fluidParticlesConfig.renderLayer
                  : null,
              excludeFromComposer: Boolean(
                localCtx.fluidParticlesConfig?.excludeFromComposer ?? true,
              ),
            };
          })();

          const climateRuntime = (() => {
            const rawClimateRuntime =
              typeof localCtx.climateController?.getRuntimeTelemetry ===
              'function'
                ? localCtx.climateController.getRuntimeTelemetry()
                : null;
            const toFiniteNumberOrNull = (value: any) => {
              const num = Number(value);
              return Number.isFinite(num) ? num : null;
            };

            return {
              version:
                typeof rawClimateRuntime?.version === 'string'
                  ? rawClimateRuntime.version
                  : null,
              lastProgress: toFiniteNumberOrNull(
                rawClimateRuntime?.lastProgress,
              ),
              lastDtMs: toFiniteNumberOrNull(rawClimateRuntime?.lastDtMs),
              updateCount: Number(rawClimateRuntime?.updateCount ?? 0),
              lastUpdatedAtMs: toFiniteNumberOrNull(
                rawClimateRuntime?.lastUpdatedAtMs,
              ),
              targetsVersion: Number(rawClimateRuntime?.targetsVersion ?? 0),
              lastTargetsSnapshot: rawClimateRuntime?.lastTargetsSnapshot
                ? serializeColors(rawClimateRuntime.lastTargetsSnapshot)
                : climateTargets,
              appliedFogDensity,
              appliedBloomStrength,
              appliedVignette,
              appliedOpacityMuls,
              safetyFactor,
            };
          })();

          const qualityProfile =
            activeQualityProfile === null ? null : String(activeQualityProfile);

          const smokePolicyState =
            localCtx.smokePolicyState ??
            localCtx.smokePolicy?.state ??
            localCtx.climateTargets?.smoke?.state ??
            localCtx.volumeEffective?.smokePolicyState ??
                localCtx.volumeEffective?.smokeState ??
            null;

          const smokePolicySource =
            localCtx.smokePolicySource ??
            localCtx.smokePolicy?.source ??
            localCtx.climateTargets?.smoke?.source ??
            null;

          const smokeAlphaLayerResolved =
            localCtx.smokeAlphaLayer ??
            localCtx.smokePolicy?.alphaLayer ??
            localCtx.climateTargets?.smoke?.alphaLayer ??
            localCtx.volumeConfig?.smokeAlphaLayer ??
            localCtx.particlesConfig?.smokeAlphaLayer ??
            null;

          const smokeCompensation =
            localCtx.smokeCompensation ??
            localCtx.smokePolicy?.compensation ??
            localCtx.climateTargets?.smoke?.compensation ??
            localCtx.volumeEffective?.smokeCompensation ??
            null;

          const qualityProfiles = {
  current: qualityProfile,
  forced:
    forcedQualityProfile === null
      ? null
      : String(forcedQualityProfile),
  autoDetected:
    autoDetectedQualityProfile === null
      ? null
      : String(autoDetectedQualityProfile),
  source: qualityProfileSource,
  estimatedCost: estimatedProfileCost,
  deviceClass: qualityDeviceClass,
  dprBucket: qualityDprBucket,
  rendererArea: qualityRendererArea,
};

          const counters = {
            reset: runtimeCountersRef.current.resetCount,
            reinit: runtimeCountersRef.current.reinitCount,
          };

          const telemetry = {
            smokePolicyState,
            smokePolicySource,
            smokeCompensation,
            sampleCount: frameStats.sampleCount,
            frameWindowSize: FRAME_WINDOW_MAX_SAMPLES,
            meanFrameTime: frameStats.meanFrameTime,
            worstFrameTime: frameStats.worstFrameTime,
            p50: frameStats.p50,
            p95: frameStats.p95,
            p99: frameStats.p99,
            avgFpsWindow: frameStats.avgFpsWindow,
            drawCalls: Number(totalRender.calls || 0),
            triangles: Number(totalRender.triangles || 0),
            points: Number(totalRender.points || 0),
            lines: Number(totalRender.lines || 0),
            dpr,
            rendererSize,
            bloomEnabled,
            fogEnabled,
            fogDensity,
            shadowMapEnabled: Boolean(renderer.shadowMap?.enabled),
            fluidParticleCount,
            smokeAlphaLayer:
              smokeAlphaLayerResolved,
            activeQualityProfile,
            forcedQualityProfile,
            autoDetectedQualityProfile,
            qualityProfileSource,
            estimatedProfileCost,
            rebuildCount: Number(
              localCtx.fluidParticlesState?.rebuildCount ?? 0,
            ),
            resetCount: runtimeCountersRef.current.resetCount,
            reinitCount: runtimeCountersRef.current.reinitCount,
          };

          const richSnapshot = {
            time: Date.now(),
            seed: (orch as any)?.ritualDNA?.seed ?? null,
            progress: (orch as any)?.progress ?? null,
            renderMode: renderModeRef.current,
            visibleSafeMode: visibleSafeModeRef.current,
            emergencyVisibleMode: emergencyVisualStateRef.current.active,
            ritualDNA: (orch as any)?.ritualDNA
              ? serializeColors((orch as any).ritualDNA)
              : null,
            ritualGenome: genome,
            state,
            orbShell,
            particlesConfig,
            fluidParticlesConfig,
            particlesRuntime,
            volumeConfig,
            volumeEffective,
            targets: climateTargets,
            climateTargets,
            orchestratorTimings,
            fluidMetrics,
            climateRuntime,
            qualityProfile,
            qualityProfiles,
            counters,
            safetyFactor,
            appliedFogDensity,
            appliedBloomStrength,
            appliedVignette,
            appliedOpacityMuls,
            lightsSnapshot: lights,
            rendererInfo,
            telemetry,
            sceneStats,
            dom,
            fluid: fluidState,
            feedbackCandidates: feedbackCandidatesRef.current,
            uiWindow,
            warnings,
          };

          localCtx.runtimeTelemetry = {
            ...(localCtx.runtimeTelemetry || {}),
            frameWindowMs: [...frameWindowRef.current],
            counters: { ...runtimeCountersRef.current },
            orchestratorTimings,
            fluidMetrics,
            climateRuntime,
            qualityProfile,
            qualityProfiles,
            lastSnapshot: richSnapshot,
            snapshotVersion: 'scene-rich-v3',
          };

          return richSnapshot;
        } catch (err: any) {
          orbWarn(
            'AUDIT',
            'snapshot error',
            {
              key: 'audit:snapshot-error',
              throttleMs: 1000,
            },
            err,
          );
          return {
            time: Date.now(),
            warnings: ['snapshot error', String(err?.message || err)],
          };
        }
      };

      const setRenderMode = (mode: RenderMode) => {
        renderModeRef.current = mode;
        orbLog(
          'AUDIT',
          'setRenderMode',
          {
            audit: true,
            key: 'audit:set-render-mode',
          },
          mode,
        );
      };

      const getRenderMode = () => renderModeRef.current;

      const setAutoFallbackOnFeedback = (enabled: boolean) => {
        autoFallbackOnFeedbackRef.current = Boolean(enabled);
        orbLog(
          'AUDIT',
          'setAutoFallbackOnFeedback',
          { audit: true, key: 'audit:set-auto-fallback' },
          autoFallbackOnFeedbackRef.current,
        );
      };

      const setFluidParticlesVisible = (visible: boolean) => {
        const localCtx = (orchestratorRef.current as any)?.ctx;
        if (!localCtx) return;

        ensureOverlayFluidIsolationConfig(localCtx);

        const nextVisible = Boolean(visible);
        const prevVisible = Boolean(localCtx.fluidParticlesConfig.enabled);

        if (prevVisible !== nextVisible) {
          localCtx.fluidParticlesConfig.enabled = nextVisible;
          resetFluidParticles(localCtx);
        }

        if (visibleSafeModeRef.current) {
          applyVisibleSafeModeRef.current(true);
        }

        scanFeedbackCandidatesRef.current('fluid-visibility-update');

        orbLog(
          'AUDIT',
          'setFluidParticlesVisible',
          {
            audit: true,
            key: 'audit:set-fluid-particles-visible',
          },
          visible,
        );
      };

      const setQualityProfile = (
        profile: 'safe' | 'low' | 'medium' | 'high' | 'ultra' | null,
      ) => {
        const localCtx = (orchestratorRef.current as any)?.ctx;
        if (!localCtx?.qualityGovernor) return null;

        const snapshot = localCtx.qualityGovernor.setForcedProfile(profile);
        writeQualitySnapshotToContext(localCtx, localCtx.qualityGovernor);

        const qualityProfile = getQualityProfileFromContext(localCtx, 'high');
        bloomPass.enabled = qualityProfile.bloomEnabled !== false;

        if (containerRef.current) {
          const width = Math.max(1, containerRef.current.clientWidth);
          const height = Math.max(1, containerRef.current.clientHeight);
          renderer.setPixelRatio(
            Math.min(window.devicePixelRatio || 1, qualityProfile.maxDpr),
          );
          renderer.setSize(width, height);
          composer.setSize(width, height);
          bloomPass.setSize(width, height);
        }

        scanFeedbackCandidatesRef.current('quality-profile-update');
        return snapshot;
      };

      const setEmergencyVisibleMode = (enabled: boolean) => {
        const active = Boolean(enabled);
        const localCtx = (orchestratorRef.current as any)?.ctx;

        if (active) {
          setRenderMode('direct');
          setFluidParticlesVisible(false);
          applyVisibleSafeModeRef.current(true);
          applyEmergencyVisualMode(localCtx);

          if (localCtx?.scene && !emergencyProbeDisposeRef.current) {
            emergencyProbeDisposeRef.current = mountDevVisibleProbe(
              localCtx.scene,
            );
          }

          const probe = localCtx?.scene?.getObjectByName?.(
            '__DEV_VISIBLE_PROBE__',
          ) as THREE.Mesh | null;
          if (probe) {
            probe.position.set(0, 0, 2.25);
            probe.scale.setScalar(2.4);
            (probe.material as any)?.color?.set?.(0xffffff);
          }

          if (localCtx?.camera?.position) {
            localCtx.camera.position.set(0, 0, 6.6);
            localCtx.camera.lookAt?.(0, 0, 0);
            localCtx.camera.layers?.set?.(ORB_BASE_RENDER_LAYER);
            localCtx.camera.updateProjectionMatrix?.();
          }

          orbLog(
            'AUDIT',
            'setEmergencyVisibleMode',
            {
              audit: true,
              key: 'audit:set-emergency-visible-mode:on',
            },
            true,
          );
          return;
        }

        emergencyProbeDisposeRef.current?.();
        emergencyProbeDisposeRef.current = null;
        restoreEmergencyVisualMode(localCtx);
        applyVisibleSafeModeRef.current(false);
        setFluidParticlesVisible(true);
        setRenderMode('composer-bloom');
        orbLog(
          'AUDIT',
          'setEmergencyVisibleMode',
          {
            audit: true,
            key: 'audit:set-emergency-visible-mode:off',
          },
          false,
        );
      };

      (window as any).__ORB_AUDIT__ = {
        ready: () => !!orchestratorRef.current,
        setSeed: (seed: string) => {
          orbLog(
            'AUDIT',
            'setSeed',
            {
              audit: true,
              key: 'audit:set-seed',
            },
            seed,
          );
          resetSceneViewRef.current?.(
            seed ? 'ritual-cycle-reset' : 'manual-seed-reset',
          );
          callInitRitual(seed);
          lastRitualSeedRef.current = String(seed || '');
          if (visibleSafeModeRef.current) {
            applyVisibleSafeModeRef.current(true);
          }
        },
        setProgress: (p: number) => {
          const clamped = Math.max(0, Math.min(1, Number(p) || 0));
          orbLog(
            'AUDIT',
            'setProgress',
            {
              audit: true,
              key: 'audit:set-progress',
              throttleMs: 250,
            },
            clamped,
          );
          (orchestratorRef.current as any)?.updateState(clamped);
        },
        resetScene: (reason = 'manual') => resetSceneViewRef.current?.(reason),
        setRenderMode,
        getRenderMode,
        setAutoFallbackOnFeedback,
        setFluidParticlesVisible,
        get smokePolicyState() {
          const currentSnapshot = snapshot() as any;
          return currentSnapshot?.telemetry?.smokePolicyState ?? null;
        },
        get smokePolicySource() {
          const currentSnapshot = snapshot() as any;
          return currentSnapshot?.telemetry?.smokePolicySource ?? null;
        },
        get smokeAlphaLayer() {
          const currentSnapshot = snapshot() as any;
          return currentSnapshot?.telemetry?.smokeAlphaLayer ?? null;
        },
     setQualityProfile,
        setVisibleSafeMode: (enabled: boolean) =>
          applyVisibleSafeModeRef.current(Boolean(enabled)),
        setEmergencyVisibleMode,
        scanFeedbackCandidates: (reason = 'manual') =>
          scanFeedbackCandidatesRef.current(reason),
        snapshot,
      };

      if (!(window as any).__ORB_AUDIT_READY__) {
        orbLog('AUDIT', 'bridge ready', {
          audit: true,
          key: 'audit:bridge-ready',
          once: true,
        });
        (window as any).__ORB_AUDIT_READY__ = true;
      }
    }

    scanFeedbackCandidatesRef.current('init');

    const renderBaseWithComposer = () => {
      renderer.clear(true, true, true);

      camera.layers.set(ORB_BASE_RENDER_LAYER);
      bloomPass.enabled = renderModeRef.current === 'composer-bloom';
      composer.render();
      baseRenderTelemetryRef.current = readRendererTelemetry(renderer);

      renderer.clearDepth();
      camera.layers.set(ORB_OVERLAY_RENDER_LAYER);
      renderer.render(scene, camera);
      overlayRenderTelemetryRef.current = readRendererTelemetry(renderer);

      lastFrameModeRef.current = renderModeRef.current;
      renderedFramesRef.current += 1;
      camera.layers.set(ORB_BASE_RENDER_LAYER);
    };

    const renderDirectLayers = () => {
      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);

      bloomPass.enabled = false;
      camera.layers.set(ORB_BASE_RENDER_LAYER);
      renderer.render(scene, camera);
      baseRenderTelemetryRef.current = readRendererTelemetry(renderer);

      renderer.clearDepth();
      camera.layers.set(ORB_OVERLAY_RENDER_LAYER);
      renderer.render(scene, camera);
      overlayRenderTelemetryRef.current = readRendererTelemetry(renderer);

      lastFrameModeRef.current = renderModeRef.current;
      renderedFramesRef.current += 1;
      camera.layers.set(ORB_BASE_RENDER_LAYER);
    };

    const animate = () => {
      try {
        const time = clockRef.current.getElapsedTime();
        const dtSeconds = time - lastTimeRef.current;
        lastTimeRef.current = time;

        const dtMs = dtSeconds * 1000;
        if (Number.isFinite(dtMs) && dtMs >= 0 && dtMs < 1000) {
          frameWindowRef.current.push(dtMs);
          if (frameWindowRef.current.length > FRAME_WINDOW_MAX_SAMPLES) {
            frameWindowRef.current.shift();
          }
        }

        if (orchestratorRef.current) {
          (orchestratorRef.current as any).update(time, dtSeconds);
        }

        const localCtx = (orchestratorRef.current as any)?.ctx ?? ctx;
        const qualityProfile = getQualityProfileFromContext(localCtx, 'high');
        bloomPass.enabled = qualityProfile.bloomEnabled !== false;
        if ((bloomPass as any).strength > qualityProfile.bloomStrengthMax) {
          (bloomPass as any).strength = qualityProfile.bloomStrengthMax;
        }

        if (containerRef.current) {
          const width = Math.max(1, containerRef.current.clientWidth);
          const height = Math.max(1, containerRef.current.clientHeight);
          const currentPixelRatio = safeGetRendererPixelRatio(renderer);
          const nextPixelRatio = Math.min(
            window.devicePixelRatio || 1,
            qualityProfile.maxDpr,
          );
          if (Math.abs(currentPixelRatio - nextPixelRatio) > 0.01) {
            renderer.setPixelRatio(nextPixelRatio);
            renderer.setSize(width, height);
            composer.setSize(width, height);
            bloomPass.setSize(width, height);
          }
        }

        if (emergencyVisualStateRef.current.active) {
          const localCtx = (orchestratorRef.current as any)?.ctx;
          if (localCtx) {
            if (localCtx.orbMesh) localCtx.orbMesh.visible = true;
            if (localCtx.wireFrames) {
              localCtx.wireFrames.forEach((w: any) => {
                w.visible = true;
              });
            }
          }
        }

        frameCountRef.current += 1;
        if (frameCountRef.current % 120 === 0) {
          scanFeedbackCandidatesRef.current('periodic');
        }

        if (renderModeRef.current === 'direct') {
          renderDirectLayers();
        } else {
          renderBaseWithComposer();
        }

        frameIdRef.current = requestAnimationFrame(animate);
        if (activeRefs) activeRefs.frameId = frameIdRef.current;
      } catch (err) {
        orbError(
          'AUDIT',
          'animate error',
          {
            key: 'audit:animate-error',
            throttleMs: 500,
          },
          err,
        );
        cancelAnimationFrame(frameIdRef.current);
        setOverlayMessage('Rendering halted (error). See console.');
      }
    };

    frameIdRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!containerRef.current) return;

      const width = Math.max(1, containerRef.current.clientWidth);
      const height = Math.max(1, containerRef.current.clientHeight);
      const localCtx = (orchestratorRef.current as any)?.ctx ?? ctx;

      if (localCtx?.qualityGovernor) {
        localCtx.qualityGovernor.setDeviceHints({
          devicePixelRatio: window.devicePixelRatio || 1,
          viewportWidth: width,
          viewportHeight: height,
          isMobile: width <= 768,
        });
        writeQualitySnapshotToContext(localCtx, localCtx.qualityGovernor);
      }

      const qualityProfile = getQualityProfileFromContext(localCtx, 'high');

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, qualityProfile.maxDpr),
      );
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
      bloomPass.enabled = qualityProfile.bloomEnabled !== false;
    };

    if (containerRef.current) {
      containerRef.current.className = 'relative w-full h-full overflow-hidden';
    }

    handleResize();

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', handleResize);
    }

    if (activeRefs) activeRefs.handleResize = handleResize;

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }

      resetSceneViewRef.current?.('unmount');
      applyVisibleSafeModeRef.current(false);
      disposeSceneResources(activeRefs);

      initRitualRef.current = false;
      orchestratorRef.current = null;
      scanFeedbackCandidatesRef.current = () => [];
      resetSceneViewRef.current = () => {};
      applyVisibleSafeModeRef.current = () => {};
      feedbackCandidatesRef.current = [];
      feedbackSignatureRef.current = '';
      renderModeRef.current = 'composer-bloom';
      visibleSafeModeRef.current = false;
      originalMaterialsRef.current = new WeakMap();
      emergencyProbeDisposeRef.current = null;
      emergencyVisualStateRef.current = {
        active: false,
        fog: null,
        toneMappingExposure: null,
        cameraPosition: null,
        volumeBackgroundVisible: null,
        volumeGlowVisible: null,
        foregroundVisible: null,
      };
      lastRitualSeedRef.current = '';
      baseRenderTelemetryRef.current = null;
      overlayRenderTelemetryRef.current = null;
      lastFrameModeRef.current = null;
      renderedFramesRef.current = 0;
      frameWindowRef.current = [];
      runtimeCountersRef.current = {
        resetCount: 0,
        reinitCount: 0,
      };

      if (
        AUDIT_RUNTIME_ENABLED &&
        (window as any).__ORB_ACTIVE_SCENE__ === activeRefs
      ) {
        delete (window as any).__ORB_ACTIVE_SCENE__;
      }

      if (AUDIT_RUNTIME_ENABLED && (window as any).__ORB_AUDIT__) {
        delete (window as any).__ORB_AUDIT__;
      }

      if (AUDIT_RUNTIME_ENABLED && (window as any).__ORB_AUDIT_READY__) {
        delete (window as any).__ORB_AUDIT_READY__;
      }
    };
  }, []);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch || !formData) return;
    orch.setRitualData(formData);
    if (visibleSafeModeRef.current) {
      applyVisibleSafeModeRef.current(true);
    }
    scanFeedbackCandidatesRef.current('formData-update');
  }, [formData]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch) return;

    const currentProgress = result
      ? 1.0
      : loading
        ? 0.95
        : Math.max(0, (stage - 1) / 9);

    if (result?.visualParams) {
      orch.setRitualData({
        visualParams: result.visualParams,
        seed: result.seed ?? result.visualParams?.seed ?? undefined,
        textLength: getOracleTextLength(result),
      });
    }

    (orch as any).updateState?.(currentProgress);

    if (visibleSafeModeRef.current) {
      applyVisibleSafeModeRef.current(true);
    }

    scanFeedbackCandidatesRef.current('result-update');
  }, [stage, loading, result]);

  useEffect(() => {
    const wasBusy = busyCycleRef.current;
    const isBusy = Boolean(loading || result);
    const freshIdle = !isBusy;

    if (freshIdle && wasBusy) {
      resetSceneViewRef.current?.('ritual-cycle-reset');
    }

    busyCycleRef.current = isBusy;
  }, [loading, result]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch) return;

    const nextSeed = String(
      result?.seed ?? result?.visualParams?.seed ?? formData?.seed ?? '',
    ).trim();

    if (!nextSeed) return;

    if (!lastRitualSeedRef.current) {
      lastRitualSeedRef.current = nextSeed;
      return;
    }

    if (nextSeed !== lastRitualSeedRef.current) {
      resetSceneViewRef.current?.('ritual-cycle-reset');
      runtimeCountersRef.current.reinitCount += 1;
      orch.initRitual(nextSeed);
      lastRitualSeedRef.current = nextSeed;
      if (visibleSafeModeRef.current) {
        applyVisibleSafeModeRef.current(true);
      }
    }
  }, [formData?.seed, result?.seed, result?.visualParams?.seed]);

  useEffect(() => {
    if (!orchestratorRef.current) return;
    const orch: any = orchestratorRef.current;

    if (!result) {
      if (orch.textManager && typeof orch.textManager.clear === 'function') {
        orch.textManager.clear();
      }
      return;
    }

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const reveal = result.finalReveal;

    if (reveal) {
      const oracleData3D = {
        chapter: reveal.chapter || 'RÉVÉLATION',
        author: reveal.author || 'Zarathoustra',
        quote: isMobile ? '' : reveal.central_tension || '',
      };

      orbLog(
        'AUDIT 3D',
        'Diète appliquée. Envoi des fragments symboliques :',
        {
          audit: true,
          key: 'audit3d:diet-applied',
          throttleMs: 1500,
        },
        oracleData3D,
      );
      if (typeof orch.triggerFinalRevelation === 'function') {
        orch.triggerFinalRevelation(oracleData3D);
      }
    }
  }, [result]);

  if (webGLFailed) {
    return (
      <div
        ref={rootRef}
        className="absolute inset-0 w-full h-full z-0 pointer-events-none"
        data-testid="oracle3d-fallback"
      >
        <div className="absolute inset-0 bg-black" />
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-md text-center text-white/70">
            <div className="mx-auto mb-5 h-14 w-14 rounded-full border border-amber-500/30 border-t-amber-400 animate-spin" />
            <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.35em] text-amber-300/70">
              Mode lecture statique
            </p>
            <p className="text-sm leading-relaxed text-white/60">
              Le moteur 3D est indisponible sur ce navigateur ou cette machine.
              Le rituel continue via l’interface HTML.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 w-full h-full z-0 pointer-events-none"
    >
      <div ref={containerRef} className="w-full h-full" />
      <div
        ref={overlayRef}
        className="absolute inset-0 hidden items-center justify-center bg-black/70 text-white text-xs uppercase tracking-[0.3em] pointer-events-none"
      >
        WebGL Fallback (Safe Mode)
      </div>
      <div
        ref={(el) => {
          if (el && typeof window !== 'undefined') {
            (window as any).__DEV_VISIBLE_PROBE__ = el;
          }
        }}
        className="hidden"
        data-testid="sceneStats"
      />
    </div>
  );
}
