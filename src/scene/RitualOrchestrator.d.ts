export class RitualOrchestrator {
  constructor(ctx: any);

  ctx: any;
  mood: string;
  progress: number;

  currentState: any;
  targetState: any;

  ritualDNA: any;

  initRitual(userName?: string, options?: any): void;
  setMood(moodName: string): void;
  setRitualData(payload?: any): void;

  updateState(progress: number, payload?: any): void;
  update(time?: number): void;
}
