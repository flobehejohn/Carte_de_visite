// Déclarations TypeScript pour modules JS (TS7016)

declare module '../../scene/modules/orbLighting' {
  export function getLightsSnapshot(ctx?: any): any[];
}

declare module '../../scene/RitualOrchestrator' {
  export class RitualOrchestrator {
    constructor(ctx?: any);

    initRitual(seed: string): void;
    update(t: number): void;

    setRitualData(payload: any): void;
    updateState(progress: number, payload?: any): void;

    currentState: any;
    ritualDNA: any;
    progress: number;
    ctx: any;
  }
}
