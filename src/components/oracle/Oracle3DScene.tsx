import { useEffect, useRef } from 'react';
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
import { RitualOrchestrator } from '../../scene/RitualOrchestrator';
import { LightSafetyGovernor } from '../../scene/safety/LightSafetyGovernor';
import { getOracleTextLength } from '../../services/zarathustraService';

interface Oracle3DSceneProps {
  formData: any;
  stage: number;
  loading: boolean;
  result: any;
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

const AUDIT_RUNTIME_ENABLED =
  import.meta.env.DEV || import.meta.env.MODE === 'test';

export function Oracle3DScene({
  formData,
  stage,
  loading,
  result,
}: Oracle3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orchestratorRef = useRef<RitualOrchestrator | null>(null);
  const frameIdRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const initRitualRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const renderModeRef = useRef<RenderMode>('composer-bloom');
  const feedbackCandidatesRef = useRef<FeedbackCandidate[]>([]);
  const feedbackSignatureRef = useRef<string>('');
  const autoFallbackOnFeedbackRef = useRef<boolean>(true);
  const scanFeedbackCandidatesRef = useRef<
    (reason?: string) => FeedbackCandidate[]
  >(() => []);
  const resetSceneViewRef = useRef<(reason?: string) => void>(() => {});
  const lastRitualSeedRef = useRef<string>('');
  const busyCycleRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0, 12);
    camera.layers.set(ORB_BASE_RENDER_LAYER);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    const baseExposure = renderer.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.autoClear = true;

    if ('outputColorSpace' in renderer) {
      (renderer as any).outputColorSpace = THREE.SRGBColorSpace;
    }

    containerRef.current.appendChild(renderer.domElement);

    let contextLost = false;
    const handleContextLost = (event: Event) => {
      event.preventDefault?.();
      contextLost = true;
      console.warn('[AUDIT] WebGL context lost');
      if (overlayRef.current) {
        overlayRef.current.style.display = 'flex';
        overlayRef.current.textContent = 'WebGL context lost';
      }
    };

    renderer.domElement.addEventListener(
      'webglcontextlost',
      handleContextLost,
      false,
    );

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.9,
      0.4,
      0.85,
    );

    const composer = new EffectComposer(renderer);
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
          color: 0x111111,
          roughness: 0.4,
          metalness: 0.8,
          side: THREE.DoubleSide,
        }),
      baseExposure,
      contextLostFlag: () => contextLost,
      renderModeRef,
      feedbackCandidatesRef,
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

    if (!initRitualRef.current) {
      orchestrator.initRitual('');
      initRitualRef.current = true;
    }

    const resetSceneView = (reason = 'manual') => {
      const localCtx = (orchestratorRef.current as any)?.ctx;
      if (!localCtx) return;

      frameCountRef.current = 0;
      feedbackCandidatesRef.current = [];
      feedbackSignatureRef.current = '';
      renderModeRef.current = 'composer-bloom';
      autoFallbackOnFeedbackRef.current = true;

      ensureOverlayFluidIsolationConfig(localCtx);
      resetFluidParticles(localCtx);

      if (overlayRef.current) {
        overlayRef.current.style.display = 'none';
        overlayRef.current.textContent = 'WebGL context lost';
      }

      localCtx.camera?.layers?.set?.(ORB_BASE_RENDER_LAYER);

      console.info('[AUDIT] resetSceneView', reason);
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
            console.warn(
              `[AUDIT] render-target feedback risk detected (${reason})`,
              candidates,
            );
          } else {
            console.info(
              `[AUDIT] no render-target feedback candidates (${reason})`,
            );
          }
        }

        if (
          candidates.length > 0 &&
          autoFallbackOnFeedbackRef.current &&
          renderModeRef.current !== 'direct'
        ) {
          renderModeRef.current = 'direct';
          console.warn(
            '[AUDIT] switching render mode to direct to bypass WebGL feedback risk',
          );
        }

        return candidates;
      } catch (error) {
        console.warn('[AUDIT] feedback scan failed', error);
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
        ctx.lightSafetyGovernor?.dispose?.();
      },
    };

    if (AUDIT_RUNTIME_ENABLED) {
      (window as any).__ORB_ACTIVE_SCENE__ = activeRefs;
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

          const lights = getLightsSnapshot ? getLightsSnapshot(localCtx) : [];
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

          const rendererInfo = localCtx.renderer?.info?.render
            ? { ...localCtx.renderer.info.render }
            : null;

          if (localCtx.contextLostFlag && localCtx.contextLostFlag()) {
            warnings.push('webgl context lost');
          }

          const fluidState = localCtx.fluidParticlesState
            ? {
                rebuildCount: localCtx.fluidParticlesState.rebuildCount ?? 0,
                meshVisible: localCtx.fluidParticlesState.mesh?.visible ?? null,
                configEnabled: localCtx.fluidParticlesConfig?.enabled ?? null,
              }
            : null;

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

          const uiWindow: any = {};

          if (scene.fog) {
            uiWindow.fog = {
              type: (scene.fog as any).isFogExp2 ? 'FogExp2' : 'Fog',
              enabled: true,
              density: (scene.fog as any).density ?? null,
              near: (scene.fog as any).near ?? null,
              far: (scene.fog as any).far ?? null,
              color: colorToHex((scene.fog as any).color) || null,
            };
            numCheck('fogDensity', (scene.fog as any).density, 0, 2);
          } else {
            uiWindow.fog = {
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
          uiWindow.autoFallbackOnFeedback = autoFallbackOnFeedbackRef.current;
          uiWindow.feedbackCandidates = feedbackCandidatesRef.current;
          uiWindow.layers = {
            composerBase: ORB_BASE_RENDER_LAYER,
            overlay: ORB_OVERLAY_RENDER_LAYER,
          };

          if (localCtx.bloomPass) {
            uiWindow.blur = {
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
            uiWindow.blur = {
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

            materials.forEach((m: any) => {
              const t = typeof m.transmission === 'number' ? m.transmission : 0;
              const o = typeof m.opacity === 'number' ? m.opacity : 1;
              const th = typeof m.thickness === 'number' ? m.thickness : 0;
              const r = typeof m.roughness === 'number' ? m.roughness : null;
              const me = typeof m.metalness === 'number' ? m.metalness : null;

              sumT += t;
              sumO += o;
              sumTh += th;
              if (r !== null) sumR += r;
              if (me !== null) sumM += me;

              minT = Math.min(minT, t);
              maxT = Math.max(maxT, t);
              minO = Math.min(minO, o);
              maxO = Math.max(maxO, o);
              minTh = Math.min(minTh, th);
              maxTh = Math.max(maxTh, th);
              count++;

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
              avgRoughness: count ? sumR / count : null,
              avgMetalness: count ? sumM / count : null,
            };
          };

          uiWindow.translucidity = collectTranslucidity() || {
            enabled: false,
            transmission: null,
            opacity: null,
            thickness: null,
            note: 'no translucent materials',
          };

          uiWindow.postprocess = {
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

          return {
            time: Date.now(),
            seed: (orch as any)?.ritualDNA?.seed ?? null,
            progress: (orch as any)?.progress ?? null,
            renderMode: renderModeRef.current,
            ritualDNA: (orch as any)?.ritualDNA
              ? serializeColors((orch as any).ritualDNA)
              : null,
            ritualGenome: genome,
            state,
            particlesConfig,
            fluidParticlesConfig,
            particlesRuntime,
            volumeConfig,
            volumeEffective,
            targets: climateTargets,
            safetyFactor,
            appliedFogDensity,
            appliedBloomStrength,
            appliedVignette,
            appliedOpacityMuls,
            lightsSnapshot: lights,
            rendererInfo,
            fluid: fluidState,
            feedbackCandidates: feedbackCandidatesRef.current,
            uiWindow,
            warnings,
          };
        } catch (err: any) {
          console.warn('[AUDIT] snapshot error', err);
          return {
            time: Date.now(),
            warnings: ['snapshot error', String(err?.message || err)],
          };
        }
      };

      const setRenderMode = (mode: RenderMode) => {
        renderModeRef.current = mode;
        console.info('[AUDIT] setRenderMode', mode);
      };

      const getRenderMode = () => renderModeRef.current;

      const setAutoFallbackOnFeedback = (enabled: boolean) => {
        autoFallbackOnFeedbackRef.current = Boolean(enabled);
        console.info(
          '[AUDIT] setAutoFallbackOnFeedback',
          autoFallbackOnFeedbackRef.current,
        );
      };

      const setFluidParticlesVisible = (visible: boolean) => {
        const localCtx = (orchestratorRef.current as any)?.ctx;
        if (!localCtx) return;

        ensureOverlayFluidIsolationConfig(localCtx);
        localCtx.fluidParticlesConfig.enabled = Boolean(visible);

        resetFluidParticles(localCtx);
        scanFeedbackCandidatesRef.current('fluid-visibility-update');

        console.info('[AUDIT] setFluidParticlesVisible', visible);
      };

      (window as any).__ORB_AUDIT__ = {
        ready: () => !!orchestratorRef.current,
        setSeed: (seed: string) => {
          console.info('[AUDIT] setSeed', seed);
          resetSceneView(seed ? 'ritual-cycle-reset' : 'manual-seed-reset');
          orchestratorRef.current?.initRitual(seed);
          lastRitualSeedRef.current = String(seed || '');
        },
        setProgress: (p: number) => {
          const clamped = Math.max(0, Math.min(1, Number(p) || 0));
          console.info('[AUDIT] setProgress', clamped);
          (orchestratorRef.current as any)?.updateState(clamped);
        },
        resetScene: (reason = 'manual') => resetSceneView(reason),
        setRenderMode,
        getRenderMode,
        setAutoFallbackOnFeedback,
        setFluidParticlesVisible,
        scanFeedbackCandidates: (reason = 'manual') =>
          scanFeedbackCandidates(reason),
        snapshot,
      };

      if (!(window as any).__ORB_AUDIT_READY__) {
        console.info('[AUDIT] bridge ready');
        (window as any).__ORB_AUDIT_READY__ = true;
      }
    }

    scanFeedbackCandidates('init');

    const renderBaseWithComposer = () => {
      camera.layers.set(ORB_BASE_RENDER_LAYER);
      bloomPass.enabled = renderModeRef.current === 'composer-bloom';
      composer.render();
      renderer.clearDepth();
      camera.layers.set(ORB_OVERLAY_RENDER_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(ORB_BASE_RENDER_LAYER);
    };

    const renderDirectLayers = () => {
      bloomPass.enabled = false;
      camera.layers.set(ORB_BASE_RENDER_LAYER);
      renderer.render(scene, camera);
      renderer.clearDepth();
      camera.layers.set(ORB_OVERLAY_RENDER_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(ORB_BASE_RENDER_LAYER);
    };

    const animate = (time: number) => {
      try {
        const t = time * 0.001;

        if (orchestratorRef.current) {
          orchestratorRef.current.update(t);
        }

        frameCountRef.current += 1;
        if (frameCountRef.current % 120 === 0) {
          scanFeedbackCandidates('periodic');
        }

        renderer.setRenderTarget(null);

        if (renderModeRef.current === 'direct') {
          renderDirectLayers();
        } else {
          renderBaseWithComposer();
        }

        frameIdRef.current = requestAnimationFrame(animate);
        if (activeRefs) activeRefs.frameId = frameIdRef.current;
      } catch (err) {
        console.error('[AUDIT] animate error', err);
        cancelAnimationFrame(frameIdRef.current);

        if (overlayRef.current) {
          overlayRef.current.style.display = 'flex';
          overlayRef.current.textContent =
            'Rendering halted (error). See console.';
        }
      }
    };

    frameIdRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloomPass.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    if (activeRefs) activeRefs.handleResize = handleResize;

    return () => {
      resetSceneView('unmount');
      disposeSceneResources(activeRefs);

      initRitualRef.current = false;
      orchestratorRef.current = null;
      scanFeedbackCandidatesRef.current = () => [];
      resetSceneViewRef.current = () => {};
      feedbackCandidatesRef.current = [];
      feedbackSignatureRef.current = '';
      renderModeRef.current = 'composer-bloom';
      lastRitualSeedRef.current = '';

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
    scanFeedbackCandidatesRef.current('formData-update');
  }, [formData]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch) return;

    const progress = result
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

    (orch as any).updateState?.(progress);
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
      orch.initRitual(nextSeed);
      lastRitualSeedRef.current = nextSeed;
    }
  }, [formData?.seed, result?.seed, result?.visualParams?.seed]);

  return (
    <div className="absolute inset-0 w-full h-full -z-10">
      <div ref={containerRef} className="w-full h-full" />
      <div
        ref={overlayRef}
        style={{ display: 'none' }}
        className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-400 text-xs uppercase tracking-[0.3em] pointer-events-none"
      >
        WebGL context lost
      </div>
    </div>
  );
}
