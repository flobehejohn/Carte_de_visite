// File: js/scene/modules/orbTextures.js
import * as THREE from 'three';

const CHROMA_FRAGMENT = `
  vec3 ck = normalize(keyColor);
  vec3 sampleColor = normalize(color.rgb + 1e-6);
  float d = distance(sampleColor, ck);
  float alpha = smoothstep(tolerance, tolerance - smoothness, d);
  color.a *= clamp(alpha, 0.0, 1.0);
  if (color.a <= 0.001) discard;
`;

const ChromaBackgroundShader = {
  uniforms: {
    tDiffuse: { value: null },
    keyColor: { value: new THREE.Color(0x00ff00) },
    tolerance: { value: 0.45 },
    smoothness: { value: 0.1 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 keyColor;
    uniform float tolerance;
    uniform float smoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      ${CHROMA_FRAGMENT}
      gl_FragColor = color;
    }
  `
};

function ensureChromaConfig(ctx) {
  if (!ctx.chromaConfig) {
    ctx.chromaConfig = {
      enabledBackground: false,
      enabledOrb: false,
      enabledMeshActive: false,
      keyColor: new THREE.Color(0x00ff00),
      tolerance: 0.45,
      smoothness: 0.08,
      activeMeshSlotId: 'mesh1',
      // Optionnel: si true, peut être recalé depuis ctx.ritualGenome (palette)
      autoFromRitual: false
    };
  } else {
    if (!ctx.chromaConfig.keyColor?.isColor) {
      ctx.chromaConfig.keyColor = new THREE.Color(ctx.chromaConfig.keyColor || 0x00ff00);
    }
    ctx.chromaConfig.activeMeshSlotId = ctx.chromaConfig.activeMeshSlotId || 'mesh1';
  }
  if (!ctx.chromaMaterials) ctx.chromaMaterials = new Set();
  return ctx.chromaConfig;
}

function updateChromaUniforms(ctx) {
  const cfg = ensureChromaConfig(ctx);
  ctx.chromaMaterials?.forEach(mat => {
    const uniforms = mat.userData?.__chromaKey?.uniforms;
    if (!uniforms) return;
    uniforms.keyColor.value.copy(cfg.keyColor);
    uniforms.tolerance.value = cfg.tolerance;
    uniforms.smoothness.value = cfg.smoothness;
  });
  if (ctx.chromaBackgroundMesh?.material?.uniforms) {
    ctx.chromaBackgroundMesh.material.uniforms.keyColor.value.copy(cfg.keyColor);
    ctx.chromaBackgroundMesh.material.uniforms.tolerance.value = cfg.tolerance;
    ctx.chromaBackgroundMesh.material.uniforms.smoothness.value = cfg.smoothness;
  }
  if (ctx.panoramaSphere?.material?.uniforms) {
    ctx.panoramaSphere.material.uniforms.keyColor.value.copy(cfg.keyColor);
    ctx.panoramaSphere.material.uniforms.tolerance.value = cfg.tolerance;
    ctx.panoramaSphere.material.uniforms.smoothness.value = cfg.smoothness;
  }
}

function applyChromaPatch(ctx, material, enabled) {
  if (!material) return;
  ensureChromaConfig(ctx);

  if (Array.isArray(material)) {
    material.forEach(mat => applyChromaPatch(ctx, mat, enabled));
    return;
  }

  if (enabled) {
    if (!material.userData) material.userData = {};
    if (!material.userData.__chromaKey) {
      material.userData.__chromaKey = {
        onBeforeCompile: material.onBeforeCompile || null,
        uniforms: {
          keyColor: { value: ctx.chromaConfig.keyColor.clone() },
          tolerance: { value: ctx.chromaConfig.tolerance },
          smoothness: { value: ctx.chromaConfig.smoothness }
        }
      };
      material.onBeforeCompile = shader => {
        const chromaUniforms = material.userData.__chromaKey.uniforms;

        shader.uniforms.keyColor = chromaUniforms.keyColor;
        shader.uniforms.tolerance = chromaUniforms.tolerance;
        shader.uniforms.smoothness = chromaUniforms.smoothness;

        if (!shader.fragmentShader.includes('uniform vec3 keyColor;')) {
          shader.fragmentShader =
            'uniform vec3 keyColor;\n' +
            'uniform float tolerance;\n' +
            'uniform float smoothness;\n' +
            shader.fragmentShader;
        }

        if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
          const injection = CHROMA_FRAGMENT.replace(/color/g, 'gl_FragColor');
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>\n${injection}`
          );
        }
      };
    }
    ctx.chromaMaterials.add(material);
    const uniforms = material.userData.__chromaKey.uniforms;
    uniforms.keyColor.value.copy(ctx.chromaConfig.keyColor);
    uniforms.tolerance.value = ctx.chromaConfig.tolerance;
    uniforms.smoothness.value = ctx.chromaConfig.smoothness;
    material.needsUpdate = true;
  } else if (material.userData?.__chromaKey) {
    const original = material.userData.__chromaKey.onBeforeCompile;
    material.onBeforeCompile = original || material.onBeforeCompile;
    delete material.userData.__chromaKey;
    ctx.chromaMaterials.delete(material);
    material.needsUpdate = true;
  }
}

function refreshOrbChromaInternal(ctx) {
  ensureChromaConfig(ctx);
  const enabled = !!ctx.chromaConfig.enabledOrb;
  if (ctx.orbMaterial) applyChromaPatch(ctx, ctx.orbMaterial, enabled);
  if (typeof ctx.forEachOrbMesh === 'function') {
    ctx.forEachOrbMesh(mesh => {
      if (mesh?.material) applyChromaPatch(ctx, mesh.material, enabled);
    });
  }
}

function refreshMeshChromaInternal(ctx) {
  ensureChromaConfig(ctx);
  if (!ctx.meshSlots) return;
  ctx.meshSlots.forEach(slot => {
    if (!slot?.root) return;
    const shouldEnable =
      ctx.chromaConfig.enabledMeshActive &&
      slot.id === ctx.chromaConfig.activeMeshSlotId;
    slot.root.traverse(child => {
      if (!child.isMesh || !child.material) return;
      applyChromaPatch(ctx, child.material, shouldEnable);
    });
  });
}

function createChromaMaterialFromTexture(ctx, texture, side = THREE.FrontSide) {
  ensureChromaConfig(ctx);
  return new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: texture },
      keyColor: { value: ctx.chromaConfig.keyColor.clone() },
      tolerance: { value: ctx.chromaConfig.tolerance },
      smoothness: { value: ctx.chromaConfig.smoothness }
    },
    vertexShader: ChromaBackgroundShader.vertexShader,
    fragmentShader: ChromaBackgroundShader.fragmentShader,
    depthWrite: false,
    transparent: true,
    side
  });
}

function ensureBackgroundPlane(ctx, texture) {
  if (!texture) return;
  if (!ctx.chromaBackgroundMesh) {
    const geom = new THREE.PlaneGeometry(40, 22.5);
    const mat = createChromaMaterialFromTexture(ctx, texture);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -100;
    mesh.name = 'ChromaBackgroundPlane';
    ctx.scene.add(mesh);
    ctx.chromaBackgroundMesh = mesh;
  } else if (ctx.chromaBackgroundMesh.material.uniforms.tDiffuse.value !== texture) {
    ctx.chromaBackgroundMesh.material.uniforms.tDiffuse.value = texture;
  }
  ctx.scene.background = null;
}

function removeBackgroundPlane(ctx) {
  if (!ctx.chromaBackgroundMesh) return;
  ctx.scene.remove(ctx.chromaBackgroundMesh);
  ctx.chromaBackgroundMesh.geometry?.dispose?.();
  ctx.chromaBackgroundMesh.material?.dispose?.();
  ctx.chromaBackgroundMesh = null;
}

function updatePanoramaMaterial(ctx, texture) {
  if (!ctx.panoramaSphere) return;
  const useChroma = !!ctx.chromaConfig?.enabledBackground;
  if (useChroma) {
    if (!ctx.panoramaSphere.material?.uniforms) {
      ctx.panoramaSphere.material?.dispose?.();
      ctx.panoramaSphere.material = createChromaMaterialFromTexture(ctx, texture, THREE.BackSide);
    } else {
      ctx.panoramaSphere.material.uniforms.tDiffuse.value = texture;
    }
  } else {
    ctx.panoramaSphere.material?.dispose?.();
    ctx.panoramaSphere.material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide
    });
  }
  updateChromaUniforms(ctx);
}

function removePanoramaSphere(ctx) {
  if (ctx.panoramaSphere) {
    ctx.scene.remove(ctx.panoramaSphere);
    ctx.panoramaSphere.geometry?.dispose?.();
    ctx.panoramaSphere.material?.dispose?.();
    ctx.panoramaSphere = null;
  }
}

function setBackgroundType(ctx, type) {
  ctx.backgroundSourceType = type || null;
}

function ensureGifRegistry(ctx) {
  if (!ctx.gifTextures) {
    ctx.gifTextures = new Set();
  } else if (!(ctx.gifTextures instanceof Set)) {
    ctx.gifTextures = new Set(Array.from(ctx.gifTextures));
  }
  return ctx.gifTextures;
}

function cleanupGifElement(record) {
  if (!record) return;
  record.texture?.dispose?.();
  if (record.element?.tagName === 'VIDEO') {
    record.element.pause?.();
    record.element.src = '';
  } else if (record.element?.tagName === 'IMG') {
    record.element.src = '';
  }
  if (typeof record.dispose === 'function') record.dispose();
}

export function registerGifRecord(ctx, record) {
  if (!record) return;
  const registry = ensureGifRegistry(ctx);
  if (!registry.has(record)) {
    registry.add(record);
  }
}

export function releaseGifRecord(ctx, record) {
  if (!record) return;
  const registry = ensureGifRegistry(ctx);
  registry.delete(record);
  cleanupGifElement(record);
}

export function createGifTexture(ctx, url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const record = {
        texture,
        element: img,
        url,
        updateFn: () => {
          texture.needsUpdate = true;
        }
      };
      resolve(record);
    };
    img.onerror = err => reject(err);
  });
}

function releaseBackgroundGif(ctx) {
  if (ctx.backgroundGifRecord) {
    releaseGifRecord(ctx, ctx.backgroundGifRecord);
    ctx.backgroundGifRecord = null;
  }
}

function releaseObjectGif(ctx) {
  if (ctx.objectGifRecord) {
    releaseGifRecord(ctx, ctx.objectGifRecord);
    ctx.objectGifRecord = null;
  }
}

function releaseSlotGif(ctx, slot) {
  if (slot?.gifRecord) {
    releaseGifRecord(ctx, slot.gifRecord);
    slot.gifRecord = null;
  }
}

export function setSlotGifRecord(ctx, slot, record) {
  if (!slot) return;
  releaseSlotGif(ctx, slot);
  slot.gifRecord = record || null;
  if (record) registerGifRecord(ctx, record);
}

export function clearSlotGifRecord(ctx, slot) {
  releaseSlotGif(ctx, slot);
}

export function updateGifTextures(ctx, time = 0) {
  const registry = ensureGifRegistry(ctx);
  if (!registry?.size) return;
  const timestamp =
    time || (typeof performance !== 'undefined' ? performance.now() : Date.now());
  registry.forEach(record => {
    if (typeof record.updateFn === 'function') {
      record.updateFn(timestamp);
    } else if (record.texture) {
      record.texture.needsUpdate = true;
    }
  });
}

function applyBackgroundTexture(ctx, texture) {
  ctx.currentBackgroundTexture = texture || null;
  if (!texture) {
    removeBackgroundPlane(ctx);
    if (ctx.backgroundMode !== 'panorama') {
      ctx.scene.background = ctx.backgroundColor || new THREE.Color(0x000000);
    }
    return;
  }

  if (ctx.backgroundMode === 'panorama') {
    removeBackgroundPlane(ctx);
    if (!ctx.panoramaSphere) {
      const geometry = new THREE.SphereGeometry(100, 64, 32);
      const material = ctx.chromaConfig?.enabledBackground
        ? createChromaMaterialFromTexture(ctx, texture, THREE.BackSide)
        : new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
      ctx.panoramaSphere = new THREE.Mesh(geometry, material);
      ctx.scene.add(ctx.panoramaSphere);
    } else {
      updatePanoramaMaterial(ctx, texture);
    }
    ctx.scene.background = null;
    ctx.scene.environment = texture;
    return;
  }

  ctx.scene.environment = null;
  if (ctx.chromaConfig?.enabledBackground) {
    ensureBackgroundPlane(ctx, texture);
  } else {
    removeBackgroundPlane(ctx);
    ctx.scene.background = texture;
  }
}

export function updateBackgroundSurface(ctx) {
  if (!ctx.chromaBackgroundMesh || !ctx.camera) return;
  ctx.chromaBackgroundMesh.position.copy(ctx.camera.position);
  ctx.chromaBackgroundMesh.quaternion.copy(ctx.camera.quaternion);
  ctx.chromaBackgroundMesh.translateZ(-20);
}

export function setBackgroundColor(ctx, color) {
  try {
    ctx.backgroundColor = new THREE.Color(color || 0x000000);
  } catch (err) {
    ctx.backgroundColor = new THREE.Color(0x000000);
  }
  if (!ctx.currentBackgroundTexture && !ctx.panoramaSphere) {
    ctx.scene.background = ctx.backgroundColor;
  }
}

export function setBackgroundFromImage(ctx, url, options = {}) {
  const isGif = options.isGif || (url && url.toLowerCase().endsWith('.gif'));
  if (!url) {
    releaseBackgroundGif(ctx);
    ctx.backgroundTexture = null;
    ctx.currentBackgroundTexture = null;
    ctx.scene.environment = null;
    removeBackgroundPlane(ctx);
    removePanoramaSphere(ctx);
    ctx.scene.background = ctx.backgroundColor || new THREE.Color(0x000000);
    setBackgroundType(ctx, null);
    ctx.backgroundUrl = null;
    ctx.backgroundVideoUrl = null;
    return;
  }

  ctx.backgroundMode = 'flat';
  ctx.backgroundUrl = url;
  ctx.backgroundVideoUrl = null;

  if (isGif) {
    createGifTexture(ctx, url)
      .then(record => {
        releaseBackgroundGif(ctx);
        registerGifRecord(ctx, record);
        ctx.backgroundGifRecord = record;
        ctx.backgroundTexture = record.texture;
        setBackgroundType(ctx, 'gif');
        applyBackgroundTexture(ctx, record.texture);
        logStatus(ctx, 'Fond GIF appliqué.');
      })
      .catch(err => {
        console.error('[OrbScene] Erreur GIF fond', err);
        if (ctx.statusHandler) ctx.statusHandler('Erreur : fond GIF', 'error');
      });
    return;
  }

  ctx.loader.load(
    url,
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      releaseBackgroundGif(ctx);
      ctx.backgroundTexture = tex;
      setBackgroundType(ctx, 'image');
      applyBackgroundTexture(ctx, tex);
      logStatus(ctx, 'Fond image appliqué.');
    },
    undefined,
    err => {
      console.error('[OrbScene] Erreur charge fond', err);
      if (ctx.statusHandler) ctx.statusHandler('Erreur : chargement fond', 'error');
    }
  );
}

function logStatus(ctx, message, level = 'info') {
  console.info(`[Textures] ${message}`);
  if (ctx.statusHandler) ctx.statusHandler(message, level);
}

export function setBackgroundVideo(ctx, videoEl) {
  if (!videoEl) return;
  const videoTex = new THREE.VideoTexture(videoEl);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;

  ctx.backgroundVideoTexture = videoTex;
  ctx.backgroundUrl = null;
  ctx.backgroundVideoUrl = videoEl?.currentSrc || videoEl?.src || null;
  ctx.backgroundMode = 'flat';
  setBackgroundType(ctx, 'video');
  applyBackgroundTexture(ctx, videoTex);
  logStatus(ctx, 'Fond vidéo appliqué.');
}

export function setPanoramaBackgroundFromImage(ctx, url) {
  if (!url) {
    return setBackgroundFromImage(ctx, url);
  }

  ctx.backgroundUrl = url;
  ctx.loader.load(
    url,
    tex => {
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;

      ctx.scene.environment = tex;
      ctx.backgroundTexture = tex;
      ctx.backgroundMode = 'panorama';
      setBackgroundType(ctx, 'panorama');

      removePanoramaSphere(ctx);
      const geometry = new THREE.SphereGeometry(100, 64, 32);
      const material = ctx.chromaConfig?.enabledBackground
        ? createChromaMaterialFromTexture(ctx, tex, THREE.BackSide)
        : new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide });
      ctx.panoramaSphere = new THREE.Mesh(geometry, material);
      ctx.scene.add(ctx.panoramaSphere);

      logStatus(ctx, 'Panorama appliqué.');
    },
    undefined,
    err => {
      console.error('[OrbScene] Erreur panorama fond', err);
      if (ctx.statusHandler) ctx.statusHandler('Erreur : panorama', 'error');
    }
  );
}

export function updateParallaxFromCamera(ctx, { yaw, pitch }) {
  if (ctx.backgroundMode !== 'panorama' || !ctx.panoramaSphere) return;
  const yawFactor = 0.6;
  const pitchFactor = 0.4;
  ctx.panoramaSphere.rotation.y = -yaw * yawFactor;
  ctx.panoramaSphere.rotation.x = -pitch * pitchFactor;
}

export function setObjectTexture(ctx, url, options = {}) {
  const isGif = options.isGif || (url && url.toLowerCase().endsWith('.gif'));
  if (!url) {
    releaseObjectGif(ctx);
    applyTextureToMain(ctx, null);
    ctx.objectTextureUrl = null;
    ctx.objectVideoUrl = null;
    return;
  }

  ctx.objectTextureUrl = url;
  ctx.objectVideoUrl = null;
  if (isGif) {
    createGifTexture(ctx, url)
      .then(record => {
        releaseObjectGif(ctx);
        registerGifRecord(ctx, record);
        ctx.objectGifRecord = record;
        applyTextureToMain(ctx, record.texture);
        refreshOrbChromaInternal(ctx);
        logStatus(ctx, 'Texture GIF appliquée.', 'info');
      })
      .catch(err => {
        console.error('[OrbScene] Erreur texture GIF', err);
        if (ctx.statusHandler) ctx.statusHandler('Erreur : texture GIF', 'error');
      });
    return;
  }

  ctx.loader.load(
    url,
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      releaseObjectGif(ctx);
      applyTextureToMain(ctx, tex);
      refreshOrbChromaInternal(ctx);
      logStatus(ctx, 'Texture appliquée.', 'success');
    },
    undefined,
    err => {
      console.error('[OrbScene] Erreur texture objet', err);
      if (ctx.statusHandler) ctx.statusHandler('Erreur : texture objet', 'error');
    }
  );
}

export function setObjectVideo(ctx, videoEl) {
  if (!videoEl) return;
  releaseObjectGif(ctx);
  const tex = new THREE.VideoTexture(videoEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  ctx.objectVideoTexture = tex;
  ctx.objectTextureUrl = null;
  ctx.objectVideoUrl = videoEl?.currentSrc || videoEl?.src || null;
  applyTextureToMain(ctx, tex);
  refreshOrbChromaInternal(ctx);
}

export function applyTextureToMain(ctx, tex) {
  ctx.setMaterialParams({ envMapIntensity: 0 });
  const apply = material => {
    material.map = tex || null;
    material.needsUpdate = true;
  };

  if (ctx.orbMaterial) apply(ctx.orbMaterial);

  if (typeof ctx.forEachOrbMesh === 'function') {
    ctx.forEachOrbMesh(mesh => apply(mesh.material));
  }

  if (ctx.currentMesh) {
    ctx.currentMesh.traverse(child => {
      if (child.isMesh && child.material) apply(child.material);
    });
  }
}

function refreshBackgroundChroma(ctx) {
  ensureChromaConfig(ctx);
  if (!ctx.currentBackgroundTexture) {
    removeBackgroundPlane(ctx);
    return;
  }
  applyBackgroundTexture(ctx, ctx.currentBackgroundTexture);
  updateChromaUniforms(ctx);
}

export function setChromaConfig(ctx, patch = {}) {
  ensureChromaConfig(ctx);
  if (patch.keyColor !== undefined) {
    try {
      ctx.chromaConfig.keyColor = new THREE.Color(patch.keyColor);
    } catch (err) {
      /* ignore */
    }
  }
  if (patch.tolerance !== undefined) ctx.chromaConfig.tolerance = Number(patch.tolerance);
  if (patch.smoothness !== undefined) ctx.chromaConfig.smoothness = Number(patch.smoothness);
  if (patch.enabledBackground !== undefined)
    ctx.chromaConfig.enabledBackground = !!patch.enabledBackground;
  if (patch.enabledOrb !== undefined) ctx.chromaConfig.enabledOrb = !!patch.enabledOrb;
  if (patch.enabledMeshActive !== undefined)
    ctx.chromaConfig.enabledMeshActive = !!patch.enabledMeshActive;

  refreshBackgroundChroma(ctx);
  refreshOrbChromaInternal(ctx);
  refreshMeshChromaInternal(ctx);
  updateChromaUniforms(ctx);
}

export function setChromaTargetSlot(ctx, slotId) {
  ensureChromaConfig(ctx);
  const exists = ctx.meshSlots?.some(slot => slot.id === slotId);
  if (exists) {
    ctx.chromaConfig.activeMeshSlotId = slotId;
    refreshMeshChromaInternal(ctx);
  }
}

export function refreshOrbChroma(ctx) {
  refreshOrbChromaInternal(ctx);
}

export function refreshMeshChroma(ctx) {
  refreshMeshChromaInternal(ctx);
}

/**
 * Optionnel: harmonise certains paramètres texture/chroma avec le rituel.
 * Ne force rien si autoFromRitual=false.
 */
export function applyRitualTextureTuning(ctx) {
  const cfg = ensureChromaConfig(ctx);
  if (!cfg.autoFromRitual) return cfg;
  const palette = ctx?.ritualGenome?.palette;
  if (palette?.accent?.isColor) {
    cfg.keyColor.copy(palette.accent);
    cfg.tolerance = Math.max(0.18, Math.min(0.65, cfg.tolerance ?? 0.45));
    cfg.smoothness = Math.max(0.04, Math.min(0.22, cfg.smoothness ?? 0.08));
    updateChromaUniforms(ctx);
  }
  return cfg;
}
