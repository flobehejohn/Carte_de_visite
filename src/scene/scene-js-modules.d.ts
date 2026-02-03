declare module '../../scene/modules/orbLighting' {
  export function getLightsSnapshot(ctx?: any): any[];
}

declare module '../../scene/RitualOrchestrator' {
  export class RitualOrchestrator {
    constructor(ctx?: any);

    // lifecycle
    initRitual(seed: string): void;
    update(t: number): void;

    // data flow
    setRitualData(payload: any): void;
    updateState(progress: number, payload?: any): void;

    // exposed state (utilisé par l’audit bridge)
    currentState: any;
    ritualDNA: any;
    progress: number;
    ctx: any;
  }
}
