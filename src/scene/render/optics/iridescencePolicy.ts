export type IridescencePolicyState =
  | 'expressive'
  | 'subtle'
  | 'minimal'
  | 'off';

export type IridescencePolicySource =
  | 'quality-profile'
  | 'ritual-state'
  | 'safety-cap';

export type IridescenceQualityProfile =
  | 'ultra'
  | 'high'
  | 'medium'
  | 'low'
  | 'safe';

export type IridescencePolicy = {
  state: IridescencePolicyState;
  intensity: number;
  hueShift: number;
  edgeBias: number;
  temporalDrift: number;
  source: IridescencePolicySource;
  safetyClamped: boolean;
};

export type IridescencePolicyInput = {
  qualityProfile?: IridescenceQualityProfile | string | null;
  ritualState?: number | null;
  safetyFactor?: number | null;
  forceOff?: boolean;
  requested?: Partial<
    Pick<
      IridescencePolicy,
      'intensity' | 'hueShift' | 'edgeBias' | 'temporalDrift'
    >
  > | null;
};

type IridescenceNumericCaps = {
  maxIntensity: number;
  maxHueShift: number;
  maxEdgeBias: number;
  maxTemporalDrift: number;
};

const DEFAULT_PROFILE: IridescenceQualityProfile = 'medium';

const BASE_POLICY_BY_STATE: Record<
  IridescencePolicyState,
  Pick<IridescencePolicy, 'intensity' | 'hueShift' | 'edgeBias' | 'temporalDrift'>
> = {
  expressive: {
    intensity: 0.72,
    hueShift: 0.2,
    edgeBias: 0.7,
    temporalDrift: 0.08,
  },
  subtle: {
    intensity: 0.32,
    hueShift: 0.1,
    edgeBias: 0.45,
    temporalDrift: 0.04,
  },
  minimal: {
    intensity: 0.12,
    hueShift: 0.04,
    edgeBias: 0.24,
    temporalDrift: 0.015,
  },
  off: {
    intensity: 0,
    hueShift: 0,
    edgeBias: 0,
    temporalDrift: 0,
  },
};

const PROFILE_CAPS: Record<IridescenceQualityProfile, IridescenceNumericCaps> = {
  ultra: {
    maxIntensity: 0.85,
    maxHueShift: 0.24,
    maxEdgeBias: 0.85,
    maxTemporalDrift: 0.12,
  },
  high: {
    maxIntensity: 0.65,
    maxHueShift: 0.18,
    maxEdgeBias: 0.7,
    maxTemporalDrift: 0.09,
  },
  medium: {
    maxIntensity: 0.4,
    maxHueShift: 0.12,
    maxEdgeBias: 0.5,
    maxTemporalDrift: 0.06,
  },
  low: {
    maxIntensity: 0.18,
    maxHueShift: 0.06,
    maxEdgeBias: 0.3,
    maxTemporalDrift: 0.03,
  },
  safe: {
    maxIntensity: 0,
    maxHueShift: 0,
    maxEdgeBias: 0,
    maxTemporalDrift: 0,
  },
};

function isKnownQualityProfile(value: unknown): value is IridescenceQualityProfile {
  return (
    value === 'ultra' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'safe'
  );
}

export function normalizeIridescenceQualityProfile(
  qualityProfile: IridescencePolicyInput['qualityProfile'],
): IridescenceQualityProfile {
  return isKnownQualityProfile(qualityProfile) ? qualityProfile : DEFAULT_PROFILE;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function sanitizeRitualState(value: number | null | undefined): number {
  return clamp(finiteOr(value, 0), 0, 1);
}

function sanitizeSafetyFactor(value: number | null | undefined): number {
  return clamp(finiteOr(value, 1), 0, 1);
}

function hasUnsafeRequestedValue(
  requested: IridescencePolicyInput['requested'],
): boolean {
  if (!requested) {
    return false;
  }

  return [
    requested.intensity,
    requested.hueShift,
    requested.edgeBias,
    requested.temporalDrift,
  ].some((value) => typeof value === 'number' && !Number.isFinite(value));
}

function hasNonOffIridescenceRequest(
  requested: IridescencePolicyInput['requested'],
): boolean {
  if (!requested) {
    return false;
  }

  return [
    requested.intensity,
    requested.hueShift,
    requested.edgeBias,
    requested.temporalDrift,
  ].some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function offPolicy(
  source: IridescencePolicySource,
  safetyClamped: boolean,
): IridescencePolicy {
  return {
    state: 'off',
    intensity: 0,
    hueShift: 0,
    edgeBias: 0,
    temporalDrift: 0,
    source,
    safetyClamped,
  };
}

export function mapQualityProfileToIridescenceState(
  qualityProfile: IridescencePolicyInput['qualityProfile'],
  ritualState: number | null | undefined = 0,
): Pick<IridescencePolicy, 'state' | 'source'> {
  const profile = normalizeIridescenceQualityProfile(qualityProfile);
  const statePressure = sanitizeRitualState(ritualState);

  if (profile === 'safe') {
    return {
      state: 'off',
      source: 'quality-profile',
    };
  }

  if (profile === 'low') {
    return {
      state: 'minimal',
      source: 'quality-profile',
    };
  }

  if (profile === 'medium') {
    return {
      state: 'subtle',
      source: 'quality-profile',
    };
  }

  if (profile === 'high') {
    if (statePressure >= 0.8) {
      return {
        state: 'expressive',
        source: 'ritual-state',
      };
    }

    return {
      state: 'subtle',
      source: 'quality-profile',
    };
  }

  return {
    state: 'expressive',
    source: 'quality-profile',
  };
}

function computeEffectiveCaps(
  profile: IridescenceQualityProfile,
  safetyFactor: number,
): IridescenceNumericCaps {
  const caps = PROFILE_CAPS[profile];

  return {
    maxIntensity: caps.maxIntensity * safetyFactor,
    maxHueShift: caps.maxHueShift * safetyFactor,
    maxEdgeBias: caps.maxEdgeBias * safetyFactor,
    maxTemporalDrift: caps.maxTemporalDrift * safetyFactor,
  };
}

export function resolveIridescencePolicy(
  input: IridescencePolicyInput = {},
): IridescencePolicy {
  const profile = normalizeIridescenceQualityProfile(input.qualityProfile);
  const safetyFactor = sanitizeSafetyFactor(input.safetyFactor);

  if (input.forceOff === true) {
    return offPolicy('safety-cap', true);
  }

  if (profile === 'safe') {
    const safetyClamped =
      hasNonOffIridescenceRequest(input.requested) ||
      hasUnsafeRequestedValue(input.requested) ||
      input.safetyFactor !== undefined ||
      input.ritualState !== undefined;

    return offPolicy(
      safetyClamped ? 'safety-cap' : 'quality-profile',
      safetyClamped,
    );
  }

  const mapped = mapQualityProfileToIridescenceState(profile, input.ritualState);
  const base = BASE_POLICY_BY_STATE[mapped.state];

  const requestedIntensity = finiteOr(input.requested?.intensity, base.intensity);
  const requestedHueShift = finiteOr(input.requested?.hueShift, base.hueShift);
  const requestedEdgeBias = finiteOr(input.requested?.edgeBias, base.edgeBias);
  const requestedTemporalDrift = finiteOr(
    input.requested?.temporalDrift,
    base.temporalDrift,
  );

  const effectiveCaps = computeEffectiveCaps(profile, safetyFactor);

  const intensity = clamp(requestedIntensity, 0, effectiveCaps.maxIntensity);
  const hueShift = clamp(requestedHueShift, 0, effectiveCaps.maxHueShift);
  const edgeBias = clamp(requestedEdgeBias, 0, effectiveCaps.maxEdgeBias);
  const temporalDrift = clamp(
    requestedTemporalDrift,
    0,
    effectiveCaps.maxTemporalDrift,
  );

  const safetyClamped =
    hasUnsafeRequestedValue(input.requested) ||
    intensity !== requestedIntensity ||
    hueShift !== requestedHueShift ||
    edgeBias !== requestedEdgeBias ||
    temporalDrift !== requestedTemporalDrift ||
    safetyFactor < 1;

  const state: IridescencePolicyState =
    intensity === 0 ? 'off' : mapped.state;

  return {
    state,
    intensity,
    hueShift,
    edgeBias,
    temporalDrift,
    source: safetyClamped ? 'safety-cap' : mapped.source,
    safetyClamped,
  };
}