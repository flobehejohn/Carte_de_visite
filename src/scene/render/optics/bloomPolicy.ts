export type BloomPolicyState =
  | 'cinematic'
  | 'balanced'
  | 'conservative'
  | 'off';

export type BloomPolicySource =
  | 'quality-profile'
  | 'ritual-energy'
  | 'safety-cap';

export type BloomQualityProfile =
  | 'ultra'
  | 'high'
  | 'medium'
  | 'low'
  | 'safe';

export type BloomPolicy = {
  state: BloomPolicyState;
  threshold: number;
  strength: number;
  radius: number;
  source: BloomPolicySource;
  safetyClamped: boolean;
};

export type BloomPolicyInput = {
  qualityProfile?: BloomQualityProfile | string | null;
  ritualEnergy?: number | null;
  safetyFactor?: number | null;
  forceOff?: boolean;
  requested?: Partial<Pick<BloomPolicy, 'threshold' | 'strength' | 'radius'>> | null;
};

type BloomNumericCaps = {
  minThreshold: number;
  maxStrength: number;
  maxRadius: number;
};

const DEFAULT_PROFILE: BloomQualityProfile = 'medium';

const BASE_POLICY_BY_STATE: Record<BloomPolicyState, Pick<BloomPolicy, 'threshold' | 'strength' | 'radius'>> = {
  cinematic: {
    threshold: 0.3,
    strength: 1.1,
    radius: 0.55,
  },
  balanced: {
    threshold: 0.55,
    strength: 0.65,
    radius: 0.3,
  },
  conservative: {
    threshold: 0.85,
    strength: 0.15,
    radius: 0.1,
  },
  off: {
    threshold: 1,
    strength: 0,
    radius: 0,
  },
};

const PROFILE_CAPS: Record<BloomQualityProfile, BloomNumericCaps> = {
  ultra: {
    maxStrength: 1.35,
    maxRadius: 0.65,
    minThreshold: 0.25,
  },
  high: {
    maxStrength: 1.1,
    maxRadius: 0.55,
    minThreshold: 0.35,
  },
  medium: {
    maxStrength: 0.75,
    maxRadius: 0.35,
    minThreshold: 0.55,
  },
  low: {
    maxStrength: 0.35,
    maxRadius: 0.2,
    minThreshold: 0.75,
  },
  safe: {
    maxStrength: 0.15,
    maxRadius: 0.1,
    minThreshold: 0.85,
  },
};

function isKnownQualityProfile(value: unknown): value is BloomQualityProfile {
  return (
    value === 'ultra' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'safe'
  );
}

export function normalizeBloomQualityProfile(
  qualityProfile: BloomPolicyInput['qualityProfile'],
): BloomQualityProfile {
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

function sanitizeEnergy(value: number | null | undefined): number {
  return clamp(finiteOr(value, 0), 0, 1);
}

function sanitizeSafetyFactor(value: number | null | undefined): number {
  return clamp(finiteOr(value, 1), 0, 1);
}

function hasNonOffBloomRequest(
  requested: BloomPolicyInput['requested'],
): boolean {
  if (!requested) {
    return false;
  }

  const threshold = requested.threshold;
  const strength = requested.strength;
  const radius = requested.radius;

  return (
    (typeof threshold === 'number' && Number.isFinite(threshold) && threshold < 1) ||
    (typeof strength === 'number' && Number.isFinite(strength) && strength > 0) ||
    (typeof radius === 'number' && Number.isFinite(radius) && radius > 0)
  );
}

function offPolicy(source: BloomPolicySource, safetyClamped: boolean): BloomPolicy {
  return {
    state: 'off',
    threshold: 1,
    strength: 0,
    radius: 0,
    source,
    safetyClamped,
  };
}

export function mapQualityProfileToBloomState(
  qualityProfile: BloomPolicyInput['qualityProfile'],
  ritualEnergy: number | null | undefined = 0,
): Pick<BloomPolicy, 'state' | 'source'> {
  const profile = normalizeBloomQualityProfile(qualityProfile);
  const energy = sanitizeEnergy(ritualEnergy);

  if (profile === 'safe') {
    return {
      state: 'off',
      source: 'quality-profile',
    };
  }

  if (profile === 'low') {
    return {
      state: 'conservative',
      source: 'quality-profile',
    };
  }

  if (profile === 'medium') {
    return {
      state: 'balanced',
      source: 'quality-profile',
    };
  }

  if (profile === 'high') {
    if (energy >= 0.8) {
      return {
        state: 'cinematic',
        source: 'ritual-energy',
      };
    }

    return {
      state: 'balanced',
      source: 'quality-profile',
    };
  }

  return {
    state: 'cinematic',
    source: 'quality-profile',
  };
}

function computeEffectiveCaps(
  profile: BloomQualityProfile,
  safetyFactor: number,
): BloomNumericCaps {
  const caps = PROFILE_CAPS[profile];

  return {
    maxStrength: caps.maxStrength * safetyFactor,
    maxRadius: caps.maxRadius * safetyFactor,
    minThreshold: Math.max(
      caps.minThreshold,
      1 - (1 - caps.minThreshold) * safetyFactor,
    ),
  };
}

export function resolveBloomPolicy(input: BloomPolicyInput = {}): BloomPolicy {
  const profile = normalizeBloomQualityProfile(input.qualityProfile);
  const safetyFactor = sanitizeSafetyFactor(input.safetyFactor);

  if (input.forceOff === true) {
    return offPolicy('safety-cap', true);
  }

  if (profile === 'safe') {
    const safetyClamped =
      hasNonOffBloomRequest(input.requested) ||
      input.safetyFactor !== undefined ||
      input.ritualEnergy !== undefined;

    return offPolicy(
      safetyClamped ? 'safety-cap' : 'quality-profile',
      safetyClamped,
    );
  }

  const mapped = mapQualityProfileToBloomState(profile, input.ritualEnergy);
  const base = BASE_POLICY_BY_STATE[mapped.state];

  const requestedThreshold = finiteOr(input.requested?.threshold, base.threshold);
  const requestedStrength = finiteOr(input.requested?.strength, base.strength);
  const requestedRadius = finiteOr(input.requested?.radius, base.radius);

  const effectiveCaps = computeEffectiveCaps(profile, safetyFactor);

  const threshold = clamp(requestedThreshold, effectiveCaps.minThreshold, 1);
  const strength = clamp(requestedStrength, 0, effectiveCaps.maxStrength);
  const radius = clamp(requestedRadius, 0, effectiveCaps.maxRadius);

  const safetyClamped =
    threshold !== requestedThreshold ||
    strength !== requestedStrength ||
    radius !== requestedRadius ||
    safetyFactor < 1;

  const state: BloomPolicyState =
    strength === 0 || radius === 0
      ? 'off'
      : mapped.state;

  return {
    state,
    threshold,
    strength,
    radius,
    source: safetyClamped ? 'safety-cap' : mapped.source,
    safetyClamped,
  };
}