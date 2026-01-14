import * as THREE from 'three';

const PLANE_COLORS = [0xff5555, 0x55ff55, 0x5555ff];
const disposedGeometries = new WeakSet();

function log(ctx, message, level = 'info') {
  console.info(`[Clipping] ${message}`);
  if (ctx.statusHandler) ctx.statusHandler(message, level);
}

function getActiveClipPlanes(ctx) {
  if (!ctx.clipPlanes || !ctx.clipPlanesState) return ctx.clipPlanes || [];
  return ctx.clipPlanes.filter((plane, idx) => ctx.clipPlanesState[idx]?.enabled !== false);
}

function initClippingState(ctx) {
  if (ctx.clipPlanesState && ctx.clipPlanesState.length === ctx.clipPlanes.length) return;
  ctx.clipPlanesState = ctx.clipPlanes.map(() => ({
    constant: ctx.clippingConfig.planeConstant ?? 0,
    negated: false,
    displayHelper: false, // Toujours false
    enabled: true,
    opacity: 0, // Totalement transparent
    color: new THREE.Color(0x000000),
    deformMode: 'none',
    deformAmplitude: 0,
    deformFrequency: 1
  }));
}

export function buildClipping(ctx) {
  initClippingState(ctx);

  // Nettoyage des anciens helpers
  if (ctx.clipHelpers) {
    ctx.scene.remove(ctx.clipHelpers);
  }

  ctx.clipHelpers = new THREE.Group();
  ctx.clipPlanes.forEach((plane, idx) => {
    const helper = new THREE.PlaneHelper(plane, 2, PLANE_COLORS[idx % PLANE_COLORS.length]);
    helper.visible = false; // Forcer l'invisibilité
    ctx.clipHelpers.add(helper);
  });
  
  ctx.clipHelpers.visible = false; // Forcer l'invisibilité globale
  ctx.scene.add(ctx.clipHelpers);

  if (!ctx.clipGroup) {
    ctx.clipGroup = new THREE.Group();
    ctx.scene.add(ctx.clipGroup);
  }

  syncClippingWithGeometry(ctx);
  updateClippingOnAllMaterials(ctx);
}

export function syncClippingWithGeometry(ctx) {
  // On ne crée plus de Mesh pour les plans (po), on garde juste la logique mathématique
  // Cela rend la coupe totalement invisible/transparente
  ctx.clipPlaneObjects = []; 
  ctx.clipStencilGroups = []; 

  updateClippingOnAllMaterials(ctx);
  console.info('[OrbScene] Clipping invisible synchronisé.');
}

export function applyClippingToMaterial(ctx, material) {
  if (!material) return;
  material.clippingPlanes = ctx.clippingConfig.enabled ? getActiveClipPlanes(ctx) : null;
  material.clipIntersection = ctx.clippingConfig.clipIntersection;
  material.needsUpdate = true;
}

export function updateClippingOnAllMaterials(ctx) {
  if (ctx.orbMaterial) applyClippingToMaterial(ctx, ctx.orbMaterial);
  if (ctx.orbLayers) ctx.orbLayers.forEach(mesh => applyClippingToMaterial(ctx, mesh?.material));
  
  // Appliquer au volume si présent
  if (ctx.volumeState?.material) {
    applyClippingToMaterial(ctx, ctx.volumeState.material);
  }
}

export function updateClippingPlanes(ctx) {
  const v = ctx.clippingConfig.planeConstant ?? 0;
  ctx.clipPlanes.forEach((plane) => {
    plane.constant = v;
  });
}