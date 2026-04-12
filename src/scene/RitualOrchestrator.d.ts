import * as THREE from 'three';

export class RitualOrchestrator {
  constructor(ctx: any);

  ctx: any;
  mood: string;
  progress: number;
  lastTime: number;

  currentState: any;
  targetState: any;
  visualState: any;
  visualTarget: any;
  ritualDNA: any;
  rng: any;

  baseRadius: number;
  baseYOffset: number;

  hatchPulse: number;
  revealActive: boolean;
  flashTimer: number;

  foregroundMesh: THREE.Mesh | null;

  llmParams: any;
  textLength: number;
  textMetrics: any;
  lastLayoutLog: number;
  lastInputs: any;

  motion: {
    mode: string;
    phase: number;
    energy: number;
    lastSwitch: number;
  };

  lastParticleModeChange: number;
  particleModeChanges: number;
  _climateWireOpacityMul: number;
  _climateParticlesOpacityMul: number;
  _climateForegroundOpacity: number | null;
  _renderMapOpts: any;

  initRitual(userName?: string, options?: any): void;
  setMood(moodName: string): void;
  setRitualData(payload?: any): void;

  _buildGenome(options: { progress: number; payload: any }): any;
  updateState(progress: number, payload?: any): void;
  updateVisuals(): void;
  applyTargetsToRuntime(
    ctx: any,
    targets: any,
    safetyFactor?: number,
    bloomClamp?: any,
  ): void;
  _updateMotionMode(time: number, dt: number): void;
  update(time?: number): void;
}
