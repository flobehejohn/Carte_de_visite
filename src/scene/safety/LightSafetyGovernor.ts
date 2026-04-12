type LightSafetyThresholds = {
  bloom: number;
  exposure: number;
  budget: number;
};

type LightSafetyEasing = {
  returnLambda: number;
};

type LightSafetyGovernorConfig = {
  maxOverDurationMs: number;
  cooldownMs: number;
  highThreshold: LightSafetyThresholds;
  lowThreshold: LightSafetyThresholds;
  easing: LightSafetyEasing;
};

type BudgetSignals = {
  keyIntensity?: number;
  fillIntensity?: number;
  rimIntensity?: number;
  glowIntensity?: number;
  backgroundStrength?: number;
  wireOpacity?: number;
  particlesOpacity?: number;
};

type LightSafetyAttach = {
  renderer?: any;
  bloomPass?: any;
  scene?: any;
  getBudgetSignals?: () => BudgetSignals | null;
};

type LightSafetyReason = "bloom" | "exposure" | "budget" | null;

type LightSafetyUpdate = {
  active: boolean;
  reason: LightSafetyReason;
  overMs: number;
  cooldownMsLeft: number;
  safetyFactor: number;
  bloomClamp?: { strength?: number; radius?: number; threshold?: number };
  exposureClamp?: number;
};

type LightSafetyState = {
  active: boolean;
  reason: LightSafetyReason;
  signal: number | null;
  overMs: number;
  cooldownMsLeft: number;
  safetyFactor: number;
};

const DEFAULT_CONFIG: LightSafetyGovernorConfig = {
  maxOverDurationMs: 2000,
  cooldownMs: 8000,
  highThreshold: { bloom: 1.15, exposure: 1.25, budget: 1.0 },
  lowThreshold: { bloom: 0.95, exposure: 1.05, budget: 0.8 },
  easing: { returnLambda: 4.0 },
};

const MIN_SAFETY_FACTOR = 0.55;
const MAX_COOLDOWN_FACTOR = 0.9;

export class LightSafetyGovernor {
  private config: LightSafetyGovernorConfig;
  private renderer: any | null = null;
  private bloomPass: any | null = null;
  private scene: any | null = null;
  private getBudgetSignals?: () => BudgetSignals | null;
  private overMs = 0;
  private cooldownMsLeft = 0;
  private safetyFactor = 1.0;
  private lastReason: LightSafetyReason = null;
  private lastSignal: number | null = null;
  private lastLogTime = 0;
  private disposed = false;

  constructor(config?: Partial<LightSafetyGovernorConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      highThreshold: { ...DEFAULT_CONFIG.highThreshold, ...(config?.highThreshold || {}) },
      lowThreshold: { ...DEFAULT_CONFIG.lowThreshold, ...(config?.lowThreshold || {}) },
      easing: { ...DEFAULT_CONFIG.easing, ...(config?.easing || {}) },
    };
  }

  attach({ renderer, bloomPass, scene, getBudgetSignals }: LightSafetyAttach) {
    this.renderer = renderer ?? null;
    this.bloomPass = bloomPass ?? null;
    this.scene = scene ?? null;
    this.getBudgetSignals = getBudgetSignals;
    return this;
  }

  update(dtMs: number): LightSafetyUpdate {
    if (this.disposed) {
      return this.buildResult(false, null);
    }

    const dt = Math.max(0, Number(dtMs) || 0);
    const dtSec = dt / 1000;

    const { signal, reason, high, low } = this.readSignal();
    this.lastSignal = signal;

    if (signal == null || high == null || low == null) {
      this.overMs = 0;
    } else if (signal >= high) {
      this.overMs += dt;
    } else if (signal <= low) {
      this.overMs = 0;
    } else {
      this.overMs = Math.max(0, this.overMs - dt * 0.5);
    }

    let active = false;
    let triggeredNow = false;
    if (this.cooldownMsLeft > 0) {
      this.cooldownMsLeft = Math.max(0, this.cooldownMsLeft - dt);
      active = true;
    } else if (signal != null && high != null && this.overMs > this.config.maxOverDurationMs) {
      this.cooldownMsLeft = this.config.cooldownMs;
      active = true;
      triggeredNow = true;
      this.lastReason = reason;
    } else if (signal == null) {
      this.lastReason = null;
    }

    if (active) {
      const clampFactor = this.computeClampFactor(signal, high);
      const targetFactor = Math.min(clampFactor, MAX_COOLDOWN_FACTOR);
      if (this.safetyFactor > targetFactor) {
        this.safetyFactor = targetFactor;
      } else {
        this.safetyFactor = this.ease(this.safetyFactor, targetFactor, this.config.easing.returnLambda, dtSec);
      }
    } else {
      this.safetyFactor = this.ease(this.safetyFactor, 1.0, this.config.easing.returnLambda, dtSec);
    }

    this.safetyFactor = this.clamp(this.safetyFactor, MIN_SAFETY_FACTOR, 1.0);

    this.logStatus(active, this.lastReason ?? reason, this.overMs, this.cooldownMsLeft, this.safetyFactor, triggeredNow);

    const bloomClamp = active && this.bloomPass ? { strength: 1.0, radius: 0.35, threshold: 0.75 } : undefined;
    const exposureClamp = active && this.renderer ? 1.05 : undefined;

    return {
      active,
      reason: active ? (this.lastReason ?? reason) : null,
      overMs: this.overMs,
      cooldownMsLeft: this.cooldownMsLeft,
      safetyFactor: this.safetyFactor,
      bloomClamp,
      exposureClamp,
    };
  }

  getState(): LightSafetyState {
    const active = this.cooldownMsLeft > 0;
    return {
      active,
      reason: active ? this.lastReason : null,
      signal: this.lastSignal,
      overMs: this.overMs,
      cooldownMsLeft: this.cooldownMsLeft,
      safetyFactor: this.safetyFactor,
    };
  }

  dispose() {
    this.renderer = null;
    this.bloomPass = null;
    this.scene = null;
    this.getBudgetSignals = undefined;
    this.disposed = true;
  }

  private buildResult(active: boolean, reason: LightSafetyReason): LightSafetyUpdate {
    return {
      active,
      reason,
      overMs: this.overMs,
      cooldownMsLeft: this.cooldownMsLeft,
      safetyFactor: this.safetyFactor,
    };
  }

  private readSignal(): { signal: number | null; reason: LightSafetyReason; high: number | null; low: number | null } {
    const bloomStrength = this.toNumber(this.bloomPass?.strength);
    if (bloomStrength != null) {
      return {
        signal: bloomStrength,
        reason: "bloom",
        high: this.config.highThreshold.bloom,
        low: this.config.lowThreshold.bloom,
      };
    }

    const exposure = this.toNumber(this.renderer?.toneMappingExposure);
    if (exposure != null) {
      return {
        signal: exposure,
        reason: "exposure",
        high: this.config.highThreshold.exposure,
        low: this.config.lowThreshold.exposure,
      };
    }

    const budget = this.computeBudget();
    if (budget != null) {
      return {
        signal: budget,
        reason: "budget",
        high: this.config.highThreshold.budget,
        low: this.config.lowThreshold.budget,
      };
    }

    return { signal: null, reason: null, high: null, low: null };
  }

  private computeBudget(): number | null {
    if (!this.getBudgetSignals) return null;
    try {
      const signals = this.getBudgetSignals();
      if (!signals) return null;

      const samples: Array<{ value: number; max: number; weight: number }> = [];
      const push = (value: unknown, max: number, weight: number) => {
        const n = this.toNumber(value);
        if (n == null) return;
        samples.push({ value: n, max, weight });
      };

      push(signals.keyIntensity, 2.2, 1.0);
      push(signals.fillIntensity, 1.2, 0.8);
      push(signals.rimIntensity, 0.95, 0.6);
      push(signals.glowIntensity, 1.2, 0.8);
      push(signals.backgroundStrength, 1.5, 0.6);
      push(signals.wireOpacity, 1.0, 0.4);
      push(signals.particlesOpacity, 1.0, 0.4);

      if (!samples.length) return null;

      let sum = 0;
      let weightSum = 0;
      for (const sample of samples) {
        const normalized = this.clamp(sample.value / sample.max, 0, 1.5);
        sum += normalized * sample.weight;
        weightSum += sample.weight;
      }
      return weightSum ? sum / weightSum : null;
    } catch (err) {
      this.log("warn", "budgetSignals indisponible");
      return null;
    }
  }

  private computeClampFactor(signal: number | null, high: number | null): number {
    if (signal == null || high == null || high <= 0) return 0.85;
    const overshoot = Math.max(0, (signal - high) / high);
    const factor = 1.0 - overshoot * 0.35;
    return this.clamp(factor, MIN_SAFETY_FACTOR, 1.0);
  }

  private ease(current: number, target: number, lambda: number, dtSec: number): number {
    const alpha = 1 - Math.exp(-Math.max(0, lambda) * Math.max(0, dtSec));
    return current + (target - current) * alpha;
  }

  private toNumber(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private log(level: "debug" | "info" | "warn", message: string) {
    if (!this.isDev()) return;
    const now = Date.now();
    if (now - this.lastLogTime < 1000) return;
    this.lastLogTime = now;
    const prefix = "[LightSafety]";
    if (level === "debug") console.debug(`${prefix} ${message}`);
    else if (level === "info") console.info(`${prefix} ${message}`);
    else console.warn(`${prefix} ${message}`);
  }

  private logStatus(
    active: boolean,
    reason: LightSafetyReason,
    overMs: number,
    cooldownMsLeft: number,
    safetyFactor: number,
    triggeredNow: boolean
  ) {
    const reasonLabel = reason ?? "none";
    const msg = `active=${active} reason=${reasonLabel} overMs=${overMs.toFixed(0)} cooldownMs=${cooldownMsLeft.toFixed(0)} factor=${safetyFactor.toFixed(2)}`;
    if (triggeredNow) {
      this.log("warn", msg);
    } else if (active) {
      this.log("info", msg);
    } else {
      this.log("debug", msg);
    }
  }

  private isDev(): boolean {
    try {
      return typeof import.meta !== "undefined" && !!(import.meta as any).env?.DEV;
    } catch {
      return false;
    }
  }
}
