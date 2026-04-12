import * as THREE from 'three';

declare global {
  interface Window {
    __ORB_AUDIT__: Record<string, any>;
  }
}

/**
 * OrbAuditBridge : Expose les invariants runtime (Niveau 1/2) pour la CI.
 * À appeler à la fin du requestAnimationFrame ou via un hook useFrame.
 */
export class OrbAuditBridge {
  static captureRuntimeState(ctx: any): void {
    if (typeof window === 'undefined') return;

    // Snapshot structurel pour l'audit CI
    window.__ORB_AUDIT__ = {
      timestamp: Date.now(),
      invariants: {
        optics: {
          // Vérification Z-Buffer & Blending en live
          volumeBackgroundDepthWrite:
            ctx.volumeState?.backgroundMaterial?.depthWrite ?? null,
          volumeGlowDepthWrite:
            ctx.volumeState?.glowMaterial?.depthWrite ?? null,
          volumeGlowIsAdditive:
            ctx.volumeState?.glowMaterial?.blending === THREE.AdditiveBlending,

          particlesPointsDepthWrite:
            ctx.particlesPoints?.material?.depthWrite ?? null,
          particlesLinksDepthWrite:
            ctx.particlesLinks?.material?.depthWrite ?? null,
          particlesTrailsDepthWrite:
            ctx.particlesTrails?.material?.depthWrite ?? null,
        },
        scene: {
          isEmergencyMode: !!ctx.runtimeFlags?.emergencyMode,
        },
      },
    };
  }
}
