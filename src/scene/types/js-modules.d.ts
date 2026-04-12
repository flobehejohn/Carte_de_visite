// Déclarations TypeScript pour modules JS importés depuis du TS/TSX
// Canonicalise les imports Oracle3DScene / RitualOrchestrator / modules overlay.

declare module '../../scene/modules/orbLighting' {
  export function getLightsSnapshot(ctx?: any): any[];
}

declare module '../../scene/modules/orbFluidParticles.js' {
  export const ORB_BASE_RENDER_LAYER: number;
  export const ORB_OVERLAY_RENDER_LAYER: number;

  export function ensureFluidParticlesConfig(ctx?: any): any;
  export function resetFluidParticles(ctx?: any): void;
  export function buildFluidParticles(ctx?: any): any;
  export function updateFluidParticles(ctx?: any, delta?: number): void;

  export function setFluidParticlesEnabled(ctx?: any, enabled?: boolean): any;
  export function setFluidParticlesConfig(ctx?: any, patch?: any): any;
}

declare module '../../scene/RitualOrchestrator' {
  export class RitualOrchestrator {
    constructor(ctx?: any);

    initRitual(seed?: string, options?: any): void;
    update(t?: number): void;

    setMood(moodName: string): void;
    setRitualData(payload?: any): void;
    updateState(progress: number, payload?: any): void;

    currentState: any;
    targetState: any;
    ritualDNA: any;
    progress: number;
    ctx: any;
  }
}
