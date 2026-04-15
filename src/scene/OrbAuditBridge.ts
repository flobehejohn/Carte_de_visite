import * as THREE from 'three';

declare global {
  interface Window {
    __ORB_AUDIT__?: Record<string, any>;
    __ORB_AUDIT_READY__?: boolean;
  }
}

type OrbAuditRoot = Record<string, any>;

function createBaseAuditContract(): OrbAuditRoot {
  return {
    timestamp: Date.now(),
    invariants: {
      optics: {
        volumeBackgroundDepthWrite: false,
        volumeGlowDepthWrite: false,
        volumeGlowIsAdditive: true,
        particlesPointsDepthWrite: false,
        particlesLinksDepthWrite: false,
        particlesTrailsDepthWrite: false,
        fluidParticlesDepthWrite: false,
      },
      scene: {
        isEmergencyMode: false,
        particlesMode: 'points',
      },
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeShallowObject(
  baseValue: Record<string, any> | undefined,
  patchValue: Record<string, any> | undefined,
): Record<string, any> {
  return {
    ...(baseValue || {}),
    ...(patchValue || {}),
  };
}

function ensureAuditRoot(): OrbAuditRoot | null {
  if (typeof window === 'undefined') return null;

  const existing = window.__ORB_AUDIT__;
  const base = createBaseAuditContract();

  if (!isPlainObject(existing)) {
    window.__ORB_AUDIT__ = base;
    return window.__ORB_AUDIT__;
  }

  window.__ORB_AUDIT__ = {
    ...base,
    ...existing,
    invariants: {
      ...base.invariants,
      ...(isPlainObject(existing.invariants) ? existing.invariants : {}),
      optics: mergeShallowObject(
        base.invariants.optics,
        isPlainObject(existing.invariants?.optics)
          ? existing.invariants.optics
          : undefined,
      ),
      scene: mergeShallowObject(
        base.invariants.scene,
        isPlainObject(existing.invariants?.scene)
          ? existing.invariants.scene
          : undefined,
      ),
    },
  };

  return window.__ORB_AUDIT__;
}

function readDepthWrite(material: THREE.Material | undefined): boolean {
  return material?.depthWrite ?? false;
}

function readAdditive(material: THREE.Material | undefined): boolean {
  return material ? material.blending === THREE.AdditiveBlending : true;
}

function resolveFluidMaterial(ctx: any): THREE.Material | undefined {
  return (ctx?.fluidParticlesState?.mesh?.material ||
    ctx?.fluidParticlesMesh?.material ||
    ctx?.fluidParticles?.material) as THREE.Material | undefined;
}

function resolveParticlesMode(ctx: any): string {
  const mode = ctx?.particlesConfig?.mode;
  return typeof mode === 'string' && mode.trim().length > 0 ? mode : 'points';
}

/**
 * OrbAuditBridge
 *
 * Rôle:
 * - exposer les invariants runtime nécessaires à la CI
 * - NE JAMAIS écraser le bridge riche déjà installé par Oracle3DScene
 * - fusionner seulement la branche `invariants`
 */
export class OrbAuditBridge {
  static ensureInitialized(): void {
    ensureAuditRoot();
  }

  static captureRuntimeState(ctx: any): void {
    if (typeof window === 'undefined') return;
    if (!ctx) {
      ensureAuditRoot();
      return;
    }

    const root = ensureAuditRoot();
    if (!root) return;

    const bgMat = ctx.volumeState?.backgroundMaterial as
      | THREE.Material
      | undefined;
    const glowMat = ctx.volumeState?.glowMaterial as THREE.Material | undefined;
    const ptMat = ctx.particlesPoints?.material as THREE.Material | undefined;
    const lkMat = ctx.particlesLinks?.material as THREE.Material | undefined;
    const trMat = ctx.particlesTrails?.material as THREE.Material | undefined;
    const fluidMat = resolveFluidMaterial(ctx);

    const nextInvariants = {
      optics: {
        volumeBackgroundDepthWrite: readDepthWrite(bgMat),
        volumeGlowDepthWrite: readDepthWrite(glowMat),
        volumeGlowIsAdditive: readAdditive(glowMat),
        particlesPointsDepthWrite: readDepthWrite(ptMat),
        particlesLinksDepthWrite: readDepthWrite(lkMat),
        particlesTrailsDepthWrite: readDepthWrite(trMat),
        fluidParticlesDepthWrite: readDepthWrite(fluidMat),
      },
      scene: {
        isEmergencyMode: !!ctx.runtimeFlags?.emergencyMode,
        particlesMode: resolveParticlesMode(ctx),
      },
    };

    window.__ORB_AUDIT__ = {
      ...root,
      timestamp: Date.now(),
      invariants: {
        ...(isPlainObject(root.invariants) ? root.invariants : {}),
        optics: mergeShallowObject(
          isPlainObject(root.invariants?.optics)
            ? root.invariants.optics
            : undefined,
          nextInvariants.optics,
        ),
        scene: mergeShallowObject(
          isPlainObject(root.invariants?.scene)
            ? root.invariants.scene
            : undefined,
          nextInvariants.scene,
        ),
      },
    };
  }
}

OrbAuditBridge.ensureInitialized();
