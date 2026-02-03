declare module '../../scene/modules/orbLighting' {
  export function getLightsSnapshot(ctx: any): any[];
}

declare module '../../scene/RitualOrchestrator' {
  export class RitualOrchestrator {
    constructor(ctx: any);
    ctx: any;
    progress?: number;
    currentState?: any;
    ritualDNA?: any;

    initRitual(seed: string): void;
    setRitualData(payload: any): void;
    updateState(progress: number, payload?: any): void;
    update(t: number): void;
  }
}
