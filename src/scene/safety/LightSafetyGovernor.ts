import { orbLog, orbWarn } from '../../shared/debug/orbDebug';
export type LightSafetyBudgetSignals = {
  keyIntensity?: number;
  fillIntensity?: number;
  rimIntensity?: number;
  glowIntensity?: number;
  backgroundStrength?: number;
  wireOpacity?: number;
  particlesOpacity?: number;
};

export type LightSafetyDecision = {
  active: boolean;
  reason: string;
  safetyFactor: number;
  overMs: number;
  cooldownMsLeft: number;
  bloomClamp?: {
    strength?: number;
    radius?: number;
    threshold?: number;
  };
};

export type LightSafetyAttachment = {
  renderer?: any;
  bloomPass?: any;
  scene?: any;
  getBudgetSignals?: () => LightSafetyBudgetSignals;
};

export type LightSafetyGovernorOptions = {
  maxOverDurationMs?: number;
  cooldownMs?: number;
  softThreshold?: number;
  hardThreshold?: number;
  softSafetyFactor?: number;
  hardSafetyFactor?: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
function logLightSafety(
  level: 'info' | 'warn',
  message: string,
  options: Record<string, unknown> = {},
): void {
  options = {
    ...options,
    key: `light-safety:${level}:${message}`,
    throttleMs: 1000,
  };

  if (level === 'warn') {
    orbWarn('LightSafety', message, options);
    return;
  }

  orbLog('LightSafety', message, options);
}

function readNestedNumber(input: unknown, path: string, fallback = 0): number {
  const value = path.split('.').reduce<unknown>((cursor, key) => {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      return (cursor as Record<string, unknown>)[key];
    }

    return undefined;
  }, input);

  return toFiniteNumber(value, fallback);
}

function deriveBudgetSignalsFromAttachment(
  attachment: LightSafetyAttachment | null,
): LightSafetyBudgetSignals {
  if (!attachment) {
    return {};
  }

  const bloomPass = attachment.bloomPass;
  const bloomStrength = readNestedNumber(bloomPass, 'strength', 0);
  const bloomRadius = readNestedNumber(bloomPass, 'radius', 0);
  const bloomThreshold = readNestedNumber(bloomPass, 'threshold', 1);
  const rendererExposure = readNestedNumber(attachment.renderer, 'toneMappingExposure', 1);
  const shadowCasters = countUsefulShadowCasters(attachment.scene);

  const bloomLoad =
    bloomStrength * rendererExposure * (1 + Math.max(0, bloomRadius) * 0.25) +
    Math.max(0, 1 - bloomThreshold) * 0.5;

  return {
    keyIntensity: bloomLoad * 2.2,
    fillIntensity: shadowCasters * 0.15,
    rimIntensity: bloomLoad * 0.5,
    glowIntensity: bloomLoad * 1.2,
    backgroundStrength: bloomLoad * 0.5,
    wireOpacity: readNestedNumber(attachment, 'wireOpacity', 0),
    particlesOpacity: readNestedNumber(attachment, 'particlesOpacity', 0),
  };
}

function computeOverloadScore(signals: LightSafetyBudgetSignals): number {
  const keyIntensity = toFiniteNumber(signals.keyIntensity, 0);
  const fillIntensity = toFiniteNumber(signals.fillIntensity, 0);
  const rimIntensity = toFiniteNumber(signals.rimIntensity, 0);
  const glowIntensity = toFiniteNumber(signals.glowIntensity, 0);
  const backgroundStrength = toFiniteNumber(signals.backgroundStrength, 0);
  const wireOpacity = clamp01(toFiniteNumber(signals.wireOpacity, 0));
  const particlesOpacity = clamp01(toFiniteNumber(signals.particlesOpacity, 0));

  return (
    keyIntensity * 0.28 +
    fillIntensity * 0.12 +
    rimIntensity * 0.18 +
    glowIntensity * 0.22 +
    backgroundStrength * 0.12 +
    wireOpacity * 0.04 +
    particlesOpacity * 0.04
  );
}

export function countUsefulShadowCasters(input: any): number {
  if (!input) return 0;

  if (Array.isArray(input)) {
    return input.filter((light) => !!light?.visible && !!light?.castShadow).length;
  }

  if (Array.isArray(input?.lights)) {
    return input.lights.filter((light: any) => !!light?.visible && !!light?.castShadow).length;
  }

  if (input?.lightsRegistry?.values) {
    let count = 0;
    for (const entry of input.lightsRegistry.values()) {
      const light = entry?.light ?? entry;
      if (light?.visible && light?.castShadow) {
        count += 1;
      }
    }
    return count;
  }

  return 0;
}

export class LightSafetyGovernor {
  private attachment: LightSafetyAttachment | null = null;
  private readonly options: Required<LightSafetyGovernorOptions>;
  private overMs = 0;
  private cooldownMsLeft = 0;

  private lastDecision: LightSafetyDecision = {
    active: false,
    reason: 'idle',
    safetyFactor: 1,
    overMs: 0,
    cooldownMsLeft: 0,
  };

  constructor(options: LightSafetyGovernorOptions = {}) {
    this.options = {
      maxOverDurationMs: Math.max(0, toFiniteNumber(options.maxOverDurationMs, 2000)),
      cooldownMs: Math.max(0, toFiniteNumber(options.cooldownMs, 3000)),
      softThreshold: Math.max(0, toFiniteNumber(options.softThreshold, 1.35)),
      hardThreshold: Math.max(0, toFiniteNumber(options.hardThreshold, 1.9)),
      softSafetyFactor: clamp01(toFiniteNumber(options.softSafetyFactor, 0.8)),
      hardSafetyFactor: clamp01(toFiniteNumber(options.hardSafetyFactor, 0.55)),
    };
  }

  attach(attachment: LightSafetyAttachment): void {
    this.attachment = attachment;
  }

  detach(): void {
    this.attachment = null;
  }

  dispose(): void {
    this.detach();
  }

  getSnapshot(): LightSafetyDecision {
    return { ...this.lastDecision };
  }

  update(dtMs = 0): LightSafetyDecision {
    const safeDtMs = Math.max(0, toFiniteNumber(dtMs, 0));
    const signals =
      this.attachment?.getBudgetSignals?.() ??
      deriveBudgetSignalsFromAttachment(this.attachment);
    const overloadScore = computeOverloadScore(signals);

    const hardOverload = overloadScore >= this.options.hardThreshold;
    const softOverload = overloadScore >= this.options.softThreshold;

    if (hardOverload) {
      logLightSafety('warn', 'hard-overload', { overloadScore });
      this.overMs = this.options.maxOverDurationMs;
      this.cooldownMsLeft = this.options.cooldownMs;

      this.lastDecision = {
        active: true,
        reason: 'hard-overload',
        safetyFactor: this.options.hardSafetyFactor,
        overMs: this.overMs,
        cooldownMsLeft: this.cooldownMsLeft,
        bloomClamp: {
          strength: 0.6,
          radius: 0.2,
          threshold: 0.95,
        },
      };

      return { ...this.lastDecision };
    }

    if (softOverload) {
      this.overMs = Math.min(
        this.options.maxOverDurationMs,
        this.overMs + safeDtMs,
      );

      if (this.overMs >= this.options.maxOverDurationMs) {
        logLightSafety('warn', 'soft-overload', { overloadScore, overMs: this.overMs });
        this.cooldownMsLeft = this.options.cooldownMs;

        this.lastDecision = {
          active: true,
          reason: 'soft-overload',
          safetyFactor: this.options.softSafetyFactor,
          overMs: this.overMs,
          cooldownMsLeft: this.cooldownMsLeft,
          bloomClamp: {
            strength: 0.72,
            radius: 0.25,
            threshold: 0.92,
          },
        };

        return { ...this.lastDecision };
      }

      this.lastDecision = {
        active: false,
        reason: 'warming-overload',
        safetyFactor: 1,
        overMs: this.overMs,
        cooldownMsLeft: this.cooldownMsLeft,
      };

      return { ...this.lastDecision };
    }

    this.overMs = 0;

    if (this.cooldownMsLeft > 0) {
      logLightSafety('info', 'cooldown', { cooldownMsLeft: this.cooldownMsLeft });
      this.cooldownMsLeft = Math.max(0, this.cooldownMsLeft - safeDtMs);

      this.lastDecision = {
        active: this.cooldownMsLeft > 0,
        reason: this.cooldownMsLeft > 0 ? 'cooldown' : 'nominal',
        safetyFactor: this.cooldownMsLeft > 0 ? this.options.softSafetyFactor : 1,
        overMs: 0,
        cooldownMsLeft: this.cooldownMsLeft,
        bloomClamp:
          this.cooldownMsLeft > 0
            ? {
                strength: 0.72,
                radius: 0.25,
                threshold: 0.92,
              }
            : undefined,
      };

      return { ...this.lastDecision };
    }

    this.lastDecision = {
      active: false,
      reason: 'nominal',
      safetyFactor: 1,
      overMs: 0,
      cooldownMsLeft: 0,
    };

    return { ...this.lastDecision };
  }
}
