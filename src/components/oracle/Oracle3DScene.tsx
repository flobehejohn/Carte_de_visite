import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { getLightsSnapshot } from '../../scene/modules/orbLighting';
import { RitualOrchestrator } from '../../scene/RitualOrchestrator';
import { LightSafetyGovernor } from '../../scene/safety/LightSafetyGovernor';

interface Oracle3DSceneProps {
  formData: any;
  stage: number;
  loading: boolean;
  result: any;
}

export function Oracle3DScene({ formData, stage, loading, result }: Oracle3DSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const orchestratorRef = useRef<RitualOrchestrator | null>(null);
  const frameIdRef = useRef<number>(0);
  const initRitualRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dispose previous scene if any (StrictMode/HMR) instead of skipping init
    const disposeSceneResources = (refs: any) => {
      if (!refs) return;
      cancelAnimationFrame(refs.frameId || 0);
      if (refs.rendererDom && refs.container?.contains(refs.rendererDom)) {
        refs.container.removeChild(refs.rendererDom);
      }
      refs.renderer?.domElement?.removeEventListener?.('webglcontextlost', refs.handleContextLost, false);
      window.removeEventListener('resize', refs.handleResize);
      refs.composer?.dispose?.();
      refs.renderer?.dispose?.();
      // tentative de cleanup scène
      refs.scene?.traverse?.((obj: any) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
      if (refs.disposeCallback) refs.disposeCallback();
    };

    if (import.meta.env.DEV && (window as any).__ORB_ACTIVE_SCENE__) {
      disposeSceneResources((window as any).__ORB_ACTIVE_SCENE__);
      (window as any).__ORB_ACTIVE_SCENE__ = null;
    }
    let activeRefs: any = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.02);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    const baseExposure = renderer.toneMappingExposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    containerRef.current.appendChild(renderer.domElement);

    let contextLost = false;
    const handleContextLost = (event: any) => {
      event.preventDefault?.();
      contextLost = true;
      console.warn('[AUDIT] WebGL context lost');
      if (overlayRef.current) overlayRef.current.style.display = 'flex';
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.4, 0.85);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const ctx: any = {
      scene, camera, renderer, composer,
      orbGroup: new THREE.Group(),
      lightsGroup: new THREE.Group(),
      layersGroup: new THREE.Group(),
      orbLayers: [], wireFrames: [], lightsRegistry: new Map(), clipPlanesState: [],
      orbShellConfig: { radius: 2.2, detail: 1, shapeType: 'icosa', baseDeformAmplitude: 0, pulseAmplitude: 0, noiseFrequency1: 1, noiseFrequency2: 1, noiseFrequency3: 1 },
      layersConfig: { count: 1, spacing: { x: 0, y: 0, z: 0.45 } },
      wireConfig: { enabled: true, color: 0xffd700, opacity: 0.5 },
      clippingConfig: { enabled: false, planeConstant: 0, showHelpers: false },
      clipPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.8)],
      ensureOrbMaterial: () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide }),
      bloomPass,
      baseExposure,
      contextLostFlag: () => contextLost
    };

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
      }
    });
    ctx.lightSafetyGovernor = lightSafetyGovernor;

    const orchestrator = new RitualOrchestrator(ctx);
    orchestratorRef.current = orchestrator;
    if (!initRitualRef.current) {
      orchestrator.initRitual('');
      initRitualRef.current = true;
    }
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
      disposeCallback: null,
    };
    activeRefs.disposeCallback = () => {
      ctx.lightSafetyGovernor?.dispose?.();
    };
    if (import.meta.env.DEV) {
      (window as any).__ORB_ACTIVE_SCENE__ = activeRefs;
    }

    // --- DEV BRIDGE (window.__ORB_AUDIT__) ---
    if (import.meta.env.DEV) {
      const colorToHex = (c: unknown) => {
        try {
          const cc = c as any;
          if (cc && typeof cc === 'object' && 'isColor' in cc && cc.isColor) return `#${cc.getHexString()}`;
          if (typeof c === 'string') return c;
          if (typeof c === 'number') return `#${new THREE.Color(c).getHexString()}`;
        } catch (_) { /* noop (eslint no-empty) */ }
        return null;
      };

      const colorToHsl = (c: unknown) => {
        try {
          const cc = c as any;
          const col = (cc && typeof cc === 'object' && 'isColor' in cc && cc.isColor) ? cc : new THREE.Color(c as any);
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
              if (xx && typeof xx === 'object' && 'isColor' in xx && xx.isColor) {
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
          const ctx = (orch as any).ctx || {};
          const lights = getLightsSnapshot ? getLightsSnapshot(ctx) : [];
          const volumeConfig = ctx.volumeConfig ? serializeColors(ctx.volumeConfig) : null;
          const particlesConfig = ctx.particlesConfig ? serializeColors(ctx.particlesConfig) : null;
          const genome = ctx.ritualGenome ? serializeColors(ctx.ritualGenome) : null;
          const state = (orch as any).currentState ? serializeColors((orch as any).currentState) : null;
          const climateTargets = ctx.climateTargets ? serializeColors(ctx.climateTargets) : null;
          const safetyFactor =
            typeof ctx.appliedSafetyFactor === 'number'
              ? ctx.appliedSafetyFactor
              : (typeof ctx.safetyFactor === 'number' ? ctx.safetyFactor : null);
          const appliedFogDensity = typeof ctx.appliedFogDensity === 'number' ? ctx.appliedFogDensity : null;
          const appliedBloomStrength = typeof ctx.appliedBloomStrength === 'number' ? ctx.appliedBloomStrength : null;
          const appliedVignette = typeof ctx.appliedVignette === 'number' ? ctx.appliedVignette : null;
          const appliedOpacityMuls = {
            wireOpacityMul: typeof ctx.appliedOpacityWireMul === 'number' ? ctx.appliedOpacityWireMul : null,
            particlesOpacityMul: typeof ctx.appliedOpacityParticlesMul === 'number' ? ctx.appliedOpacityParticlesMul : null,
            foregroundOpacity: typeof ctx.appliedOpacityForeground === 'number' ? ctx.appliedOpacityForeground : null,
          };
          const rendererInfo = ctx.renderer?.info?.render ? { ...ctx.renderer.info.render } : null;
          if (ctx.contextLostFlag && ctx.contextLostFlag()) warnings.push('webgl context lost');

          const fluidState = ctx.fluidParticlesState
            ? {
                rebuildCount: ctx.fluidParticlesState.rebuildCount ?? 0,
                meshVisible: ctx.fluidParticlesState.mesh?.visible ?? null
              }
            : null;

          const particlesRuntime = (() => {
            const pw: string[] = [];
            const res: any = {};
            if (!ctx.particlesConfig) { pw.push('particlesConfig missing'); return { warnings: pw }; }
            res.mode = ctx.particlesConfig.mode || null;
            res.count = ctx.particlesPoints?.geometry?.getAttribute?.('position')?.count || ctx.particlesConfig.count || null;
            res.size = ctx.particlesConfig.size ?? null;
            res.linkDistance = ctx.particlesConfig.linkDistance ?? null;
            res.dynamics = ctx.particlesConfig.dynamics || null;
            res.style = ctx.ritualGenome?.geometry?.particleStyle || ctx.ritualDNA?.particleStyle || null;
            if (typeof res.linkDistance === 'number' && (res.linkDistance < 0 || res.linkDistance > 10)) pw.push('linkDistance out of range');
            if (typeof res.size === 'number' && (res.size < 0 || res.size > 5)) pw.push('particle size out of range');
            res.warnings = pw;
            return res;
          })();

          const volumeEffective = (() => {
            if (!ctx.volumeConfig) return null;
            return {
              backgroundStrength: ctx.volumeConfig.backgroundStrength,
              glowIntensity: ctx.volumeConfig.glowIntensity,
              softness: ctx.volumeConfig.softness,
              vignette: ctx.volumeConfig.vignette,
              noise: {
                scale: (ctx.volumeConfig as any).noiseScale ?? null,
                speed: (ctx.volumeConfig as any).noiseSpeed ?? null,
                amount: (ctx.volumeConfig as any).noiseAmount ?? null
              }
            };
          })();

          const numCheck = (label: string, v: any, min: number, max: number) => {
            if (typeof v === 'number' && (Number.isNaN(v) || v < min || v > max)) warnings.push(`${label} out of range`);
            if (typeof v === 'number' && !Number.isFinite(v)) warnings.push(`${label} NaN/Inf`);
          };

          numCheck('softness', ctx.volumeConfig?.softness, 0, 2);
          numCheck('backgroundStrength', ctx.volumeConfig?.backgroundStrength, 0, 5);
          numCheck('glowIntensity', ctx.volumeConfig?.glowIntensity, 0, 5);
          if (particlesRuntime?.warnings?.length) warnings.push(...particlesRuntime.warnings);

          const nanCheck = (label: string, v: any) => { if (typeof v === 'number' && Number.isNaN(v)) warnings.push(`${label} NaN`); };
          nanCheck('state.lightIntensity', state?.lightIntensity);
          nanCheck('state.bloomStrength', state?.bloomStrength);
          nanCheck('state.glowIntensity', state?.glowIntensity);
          nanCheck('volumeEffective.backgroundStrength', volumeEffective?.backgroundStrength);
          nanCheck('volumeEffective.glowIntensity', volumeEffective?.glowIntensity);

          const uiWindow: any = {};
          if (scene?.fog) {
            uiWindow.fog = {
              type: (scene.fog as any).isFogExp2 ? 'FogExp2' : 'Fog',
              enabled: true,
              density: (scene.fog as any).density ?? null,
              near: (scene.fog as any).near ?? null,
              far: (scene.fog as any).far ?? null,
              color: colorToHex((scene.fog as any).color) || null
            };
            numCheck('fogDensity', (scene.fog as any).density, 0, 2);
          } else {
            uiWindow.fog = { enabled: false, density: null, near: null, far: null, color: null, note: 'fog missing' };
            warnings.push('fog missing');
          }

          if (ctx.bloomPass) {
            uiWindow.blur = {
              type: 'bloom-proxy',
              enabled: !!ctx.bloomPass.strength && ctx.bloomPass.strength > 0,
              strength: ctx.bloomPass.strength ?? null,
              threshold: (ctx.bloomPass as any).threshold ?? null,
              radius: (ctx.bloomPass as any).radius ?? null,
              note: 'proxy blur via bloom pass'
            };
          } else {
            uiWindow.blur = { type: 'none', enabled: false, radius: null, strength: null, note: 'blur not provided' };
          }

          const collectTranslucidity = () => {
            const materials: THREE.Material[] = [];
            const root = ctx.orbGroup || ctx.layersGroup;
            if (!root) return null;
            root.traverse?.((obj: any) => {
              if (obj?.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m: any) => materials.push(m));
              }
            });
            if (!materials.length) return null;

            let sumT = 0, sumO = 0, sumTh = 0, sumR = 0, sumM = 0;
            let minT = Infinity, maxT = -Infinity;
            let minO = Infinity, maxO = -Infinity;
            let minTh = Infinity, maxTh = -Infinity;
            let count = 0;

            materials.forEach((m: any) => {
              const t = typeof m.transmission === 'number' ? m.transmission : 0;
              const o = typeof m.opacity === 'number' ? m.opacity : 1;
              const th = typeof m.thickness === 'number' ? m.thickness : 0;
              const r = typeof m.roughness === 'number' ? m.roughness : null;
              const me = typeof m.metalness === 'number' ? m.metalness : null;

              sumT += t; sumO += o; sumTh += th;
              if (r !== null) sumR += r;
              if (me !== null) sumM += me;

              minT = Math.min(minT, t); maxT = Math.max(maxT, t);
              minO = Math.min(minO, o); maxO = Math.max(maxO, o);
              minTh = Math.min(minTh, th); maxTh = Math.max(maxTh, th);
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

          uiWindow.translucidity = collectTranslucidity() || { enabled: false, transmission: null, opacity: null, thickness: null, note: 'no translucent materials' };
          uiWindow.postprocess = {
            bloomStrength: ctx.bloomPass?.strength ?? null,
            toneMapping: ctx.renderer?.toneMapping ?? null,
            toneMappingExposure: (ctx.renderer as any)?.toneMappingExposure ?? null,
            vignette: ctx.volumeConfig?.vignette ?? null
          };
          numCheck('bloomStrength', ctx.bloomPass?.strength, 0, 8);

          return {
            time: Date.now(),
            seed: (orch as any)?.ritualDNA?.seed,
            progress: (orch as any)?.progress,
            ritualDNA: (orch as any)?.ritualDNA ? serializeColors((orch as any).ritualDNA) : null,
            ritualGenome: genome,
            state,
            particlesConfig,
            particlesRuntime,
            volumeConfig,
            volumeEffective,
            targets: climateTargets,
            safetyFactor,
            appliedFogDensity,
            appliedBloomStrength,
            appliedVignette,
            appliedOpacityMuls,
            climateTargets,
            lightsSnapshot: lights,
            rendererInfo,
            fluid: fluidState,
            uiWindow,
            warnings
          };
        } catch (err: any) {
          console.warn('[AUDIT] snapshot error', err);
          return { time: Date.now(), warnings: ['snapshot error', String(err?.message || err)] };
        }
      };

      (window as any).__ORB_AUDIT__ = {
        ready: () => !!orchestratorRef.current,
        setSeed: (seed: string) => {
          console.info('[AUDIT] setSeed', seed);
          orchestratorRef.current?.initRitual(seed);
        },
        setProgress: (p: number) => {
          const clamped = Math.max(0, Math.min(1, Number(p) || 0));
          console.info('[AUDIT] setProgress', clamped);
          (orchestratorRef.current as any)?.updateState(clamped);
        },
        snapshot,
      };

      if (!(window as any).__ORB_AUDIT_READY__) {
        console.info('[AUDIT] bridge ready');
        (window as any).__ORB_AUDIT_READY__ = true;
      }
    }

    const animate = (time: number) => {
      try {
        const t = time * 0.001;
        if (orchestratorRef.current) orchestratorRef.current.update(t);
        composer.render();
        frameIdRef.current = requestAnimationFrame(animate);
        if (activeRefs) activeRefs.frameId = frameIdRef.current;
      } catch (err) {
        console.error('[AUDIT] animate error', err);
        cancelAnimationFrame(frameIdRef.current);
        if (overlayRef.current) {
          overlayRef.current.style.display = 'flex';
          overlayRef.current.textContent = 'Rendering halted (error). See console.';
        }
      }
    };
    frameIdRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    if (activeRefs) activeRefs.handleResize = handleResize;

    return () => {
      disposeSceneResources(activeRefs);
      initRitualRef.current = false;
      orchestratorRef.current = null;
      if (import.meta.env.DEV && (window as any).__ORB_ACTIVE_SCENE__ === activeRefs) {
        delete (window as any).__ORB_ACTIVE_SCENE__;
      }
      if (import.meta.env.DEV && (window as any).__ORB_AUDIT__) delete (window as any).__ORB_AUDIT__;
    };
  }, []);

  // TRANSMISSION DES DONNEES (Connexion Vitale)
  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch || !formData) return;
    orch.setRitualData(formData);
  }, [formData]);

  useEffect(() => {
    const orch = orchestratorRef.current;
    if (!orch) return;

    const progress = result ? 1.0 : (loading ? 0.95 : Math.max(0, (stage - 1) / 9));

    if (result?.visualParams) {
      const quoteLen = result.quote?.length ?? 0;
      const interpLen = result.interpretation?.length ?? 0;
      const textLength = quoteLen + interpLen;

      orch.setRitualData({
        visualParams: result.visualParams,
        seed: result.seed ?? result.visualParams?.seed ?? undefined,
        textLength
      });
    }

    (orch as any).updateState?.(progress);
  }, [stage, loading, result]);

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
