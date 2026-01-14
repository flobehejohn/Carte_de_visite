import * as THREE from 'three';
import * as orbTextures from './orbTextures.js';

const REBUILD_KEYS = ['enabled', 'mode', 'width', 'depth', 'segmentsX', 'segmentsZ'];
const TEXTURE_FILTERING = ['smooth', 'pixelated'];

function clamp01(value) {
  const num = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(num) ? num : 0));
}

function normalizeFiltering(value) {
  return TEXTURE_FILTERING.includes(value) ? value : 'smooth';
}

function configureTextureFiltering(texture, mode = 'smooth') {
  if (!texture) return;
  const pixelated = mode === 'pixelated';
  if (pixelated) {
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  } else {
    texture.minFilter = texture.isVideoTexture ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = !texture.isVideoTexture;
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
}

function refreshMaterialFromConfig(ctx) {
  if (!ctx.groundMesh) return;
  const cfg = ensureConfig(ctx);
  const material = ctx.groundMesh.material;
  const opacity = clamp01(cfg.shadowOpacity ?? 1);
  material.opacity = opacity;
  material.transparent = opacity < 1;
  if (material.map) {
    configureTextureFiltering(material.map, cfg.textureFiltering);
  }
  material.needsUpdate = true;
}

function log(ctx, message, level = 'info') {
  console.info(`[Ground] ${message}`);
  if (ctx.statusHandler) ctx.statusHandler(message, level);
}

function ensureConfig(ctx) {
  if (!ctx.groundConfig) {
    ctx.groundConfig = {
      enabled: false,
      mode: 'plane',
      width: 20,
      depth: 20,
      segmentsX: 32,
      segmentsZ: 32,
      color: new THREE.Color(0x1a1a1a), // Gris sombre neutre
      receiveShadow: true,
      castShadow: false,
      textureMode: 'none',
      position: { x: 0, y: -2.0, z: 0 },
      shadowOpacity: 1,
      textureFiltering: 'smooth',
      deformation: {
        enabled: false,
        type: 'noise',
        amplitude: 1,
        frequency: 1,
        speed: 0.3,
        seed: 0
      }
    };
  } else if (!ctx.groundConfig.color?.isColor) {
    ctx.groundConfig.color = new THREE.Color(ctx.groundConfig.color ?? 0x1a1a1a);
  }
  if (!ctx.groundConfig.deformation) {
    ctx.groundConfig.deformation = {
      enabled: false,
      type: 'noise',
      amplitude: 1,
      frequency: 1,
      speed: 0.3,
      seed: 0
    };
  }
  if (!ctx.groundConfig.position) {
    ctx.groundConfig.position = { x: 0, y: -2.0, z: 0 };
  } else {
    ctx.groundConfig.position = {
      x: Number(ctx.groundConfig.position.x ?? 0),
      y: Number(ctx.groundConfig.position.y ?? -2.0),
      z: Number(ctx.groundConfig.position.z ?? 0)
    };
  }
  ctx.groundConfig.shadowOpacity = clamp01(
    ctx.groundConfig.shadowOpacity === undefined ? 1 : ctx.groundConfig.shadowOpacity
  );
  ctx.groundConfig.textureFiltering = normalizeFiltering(ctx.groundConfig.textureFiltering);
  return ctx.groundConfig;
}

function disposeGroundTexture(ctx) {
  if (!ctx.groundTextureInfo) return;
  const info = ctx.groundTextureInfo;
  if (info.record && orbTextures.releaseGifRecord) {
    orbTextures.releaseGifRecord(ctx, info.record);
  } else if (info.texture) {
    info.texture.dispose?.();
  }
  if (info.videoEl) {
    info.videoEl.pause?.();
    info.videoEl.src = '';
  }
  ctx.groundTextureInfo = null;
}

function disposeGround(ctx) {
  if (ctx.groundMesh) {
    ctx.scene.remove(ctx.groundMesh);
    ctx.groundMesh.geometry?.dispose?.();
    ctx.groundMesh.material?.dispose?.();
    ctx.groundMesh = null;
  }
  disposeGroundTexture(ctx);
}

function createGeometry(cfg) {
  const width = cfg.width ?? 20;
  const depth = cfg.depth ?? 20;
  const segmentsX = Math.max(1, Math.floor(cfg.segmentsX ?? 32));
  const segmentsZ = Math.max(1, Math.floor(cfg.segmentsZ ?? 32));
  const geometry = new THREE.PlaneGeometry(width, depth, segmentsX, segmentsZ);
  geometry.rotateX(-Math.PI / 2);
  geometry.userData.basePositions = geometry.attributes.position.array.slice();
  return geometry;
}

function applyTerrainNoise(geometry, cfg) {
  if (cfg.mode !== 'terrain') return;
  const pos = geometry.attributes.position;
  const base = geometry.userData.basePositions;
  if (!pos || !base) return;
  const freq = cfg.deformation.frequency ?? 1;
  const amp = (cfg.deformation.amplitude ?? 1) * 0.5;
  const seed = cfg.deformation.seed ?? 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const height =
      Math.sin((x + seed) * freq * 0.5) * amp +
      Math.cos((z - seed) * freq * 0.7) * amp;
    pos.setY(i, pos.getY(i) + height);
    base[i * 3 + 1] = pos.getY(i);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function buildMaterial(ctx) {
  const cfg = ensureConfig(ctx);
  const opacity = clamp01(cfg.shadowOpacity ?? 1);
  const material = new THREE.MeshStandardMaterial({
    color: cfg.color.clone(),
    metalness: 0.1,
    roughness: 0.9,
    opacity,
    transparent: opacity < 1
  });
  if (ctx.groundTextureInfo?.texture) {
    material.map = ctx.groundTextureInfo.texture;
    configureTextureFiltering(material.map, cfg.textureFiltering);
  }
  return material;
}

// EXPORTS MANQUANTS DANS VOTRE VERSION PRECEDENTE :

export function buildGround(ctx) {
  const cfg = ensureConfig(ctx);
  disposeGround(ctx);
  if (!cfg.enabled) {
    log(ctx, 'Sol désactivé.');
    return null;
  }

  const geometry = createGeometry(cfg);
  applyTerrainNoise(geometry, cfg);
  const material = buildMaterial(ctx);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = !!cfg.receiveShadow;
  mesh.castShadow = !!cfg.castShadow;
  mesh.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
  mesh.name = 'Ground';

  ctx.scene.add(mesh);
  ctx.groundMesh = mesh;

  log(
    ctx,
    `Mode=${cfg.mode} size=${cfg.width}x${cfg.depth} seg=${cfg.segmentsX}x${cfg.segmentsZ}`
  );

  return mesh;
}

export function updateGroundDeformation(ctx, time) {
  const cfg = ensureConfig(ctx);
  const mesh = ctx.groundMesh;
  if (!mesh || !cfg.deformation.enabled) return;
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const base = geometry.userData.basePositions;
  if (!pos || !base) return;

  const def = cfg.deformation;
  const freq = def.frequency ?? 1;
  const amp = def.amplitude ?? 0;
  const speed = def.speed ?? 0.3;
  const seed = def.seed ?? 0;

  for (let i = 0; i < pos.count; i++) {
    const baseX = base[i * 3];
    const baseY = base[i * 3 + 1];
    const baseZ = base[i * 3 + 2];
    let offset = 0;
    if (def.type === 'wave') {
      offset = Math.sin(time * speed + (baseX + baseZ + seed) * freq) * amp;
    } else {
      const n1 = Math.sin((baseX + seed) * freq + time * speed);
      const n2 = Math.cos((baseZ - seed) * freq * 0.7 + time * speed * 1.1);
      offset = (n1 + n2) * 0.5 * amp;
    }
    pos.setXYZ(i, baseX, baseY + offset, baseZ);
  }

  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

export function setGroundTextureFromUrl(ctx, url, options = {}) {
  ensureConfig(ctx);
  if (!url) {
    return clearGroundTexture(ctx);
  }
  const isGif =
    options.isGif ??
    (typeof url === 'string' && url.toLowerCase().endsWith('.gif'));
  if (isGif) {
    orbTextures
      .createGifTexture(ctx, url)
      .then(record => {
        orbTextures.registerGifRecord?.(ctx, record);
        applyTexture(ctx, record.texture, 'gif', { record });
      })
      .catch(err => console.error('[Ground] GIF', err));
    return;
  }
  // Utilisation sécurisée du loader
  if (ctx.loader) {
      ctx.loader.load(
        url,
        tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          applyTexture(ctx, tex, 'image');
        },
        undefined,
        err => console.error('[Ground] Texture', err)
      );
  } else {
      // Fallback si pas de loader global
      new THREE.TextureLoader().load(url, tex => {
          tex.colorSpace = THREE.SRGBColorSpace;
          applyTexture(ctx, tex, 'image');
      });
  }
}

function applyTexture(ctx, texture, mode, extra = {}) {
  ensureConfig(ctx);
  disposeGroundTexture(ctx);
  ctx.groundTextureInfo = { type: mode, texture, ...extra };
  configureTextureFiltering(texture, ctx.groundConfig.textureFiltering);
  if (ctx.groundMesh) {
    ctx.groundMesh.material.map = texture;
    ctx.groundMesh.material.needsUpdate = true;
  }
  ctx.groundConfig.textureMode = mode;
  log(ctx, `Texture ${mode} appliquée`);
}

export function setGroundVideo(ctx, videoEl) {
  if (!videoEl) return;
  const tex = new THREE.VideoTexture(videoEl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  applyTexture(ctx, tex, 'video', { videoEl });
}

export function setGroundGif(ctx, url) {
  return setGroundTextureFromUrl(ctx, url, { isGif: true });
}

export function clearGroundTexture(ctx) {
  ensureConfig(ctx);
  if (ctx.groundMesh) {
    ctx.groundMesh.material.map = null;
    ctx.groundMesh.material.needsUpdate = true;
  }
  disposeGroundTexture(ctx);
  ctx.groundConfig.textureMode = 'none';
  log(ctx, 'Texture sol réinitialisée.');
}

export function setGroundConfig(ctx, patch = {}) {
  const cfg = ensureConfig(ctx);
  let rebuild = false;
  REBUILD_KEYS.forEach(key => {
    if (patch[key] === undefined) return;
    let nextValue = patch[key];
    if (key === 'enabled') nextValue = !!patch[key];
    else if (key === 'mode') nextValue = patch[key];
    else nextValue = Number(patch[key]);
    if (cfg[key] !== nextValue) {
      cfg[key] = nextValue;
      rebuild = true;
    }
  });

  if (patch.color !== undefined) {
    try {
      cfg.color = new THREE.Color(patch.color);
    } catch {
      cfg.color = new THREE.Color(0x1a1a1a);
    }
    if (ctx.groundMesh) {
      ctx.groundMesh.material.color.copy(cfg.color);
    }
  }
  if (patch.receiveShadow !== undefined) cfg.receiveShadow = !!patch.receiveShadow;
  if (patch.castShadow !== undefined) cfg.castShadow = !!patch.castShadow;

  if (patch.deformation) {
    cfg.deformation = {
      ...cfg.deformation,
      ...patch.deformation
    };
  }

  if (patch.position) {
    cfg.position = {
      x:
        patch.position.x !== undefined ? Number(patch.position.x) : cfg.position.x,
      y:
        patch.position.y !== undefined ? Number(patch.position.y) : cfg.position.y,
      z:
        patch.position.z !== undefined ? Number(patch.position.z) : cfg.position.z
    };
    if (ctx.groundMesh) {
      ctx.groundMesh.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
    }
  }

  if (patch.shadowOpacity !== undefined) {
    cfg.shadowOpacity = clamp01(patch.shadowOpacity);
    if (ctx.groundMesh) {
      const material = ctx.groundMesh.material;
      material.opacity = cfg.shadowOpacity;
      material.transparent = cfg.shadowOpacity < 1;
      material.needsUpdate = true;
    }
  }

  if (patch.textureFiltering) {
    cfg.textureFiltering = normalizeFiltering(patch.textureFiltering);
    if (ctx.groundTextureInfo?.texture) {
      configureTextureFiltering(ctx.groundTextureInfo.texture, cfg.textureFiltering);
    }
    refreshMaterialFromConfig(ctx);
  }

  if (rebuild) {
    buildGround(ctx);
  } else if (ctx.groundMesh) {
    ctx.groundMesh.receiveShadow = !!cfg.receiveShadow;
    ctx.groundMesh.castShadow = !!cfg.castShadow;
  } else if (cfg.enabled) {
    buildGround(ctx);
  } else {
    disposeGround(ctx);
  }
  return cfg;
}