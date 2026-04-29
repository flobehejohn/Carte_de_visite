import {
  resolveBloomPolicy,
  type BloomPolicy,
  type BloomPolicyInput,
} from './bloomPolicy';

import {
  resolveIridescencePolicy,
  type IridescencePolicy,
  type IridescencePolicyInput,
} from './iridescencePolicy';

export type RuntimeOpticsPolicyInput = {
  qualityProfile?: string | null;
  ritualEnergy?: number | null;
  ritualState?: number | null;
  safetyFactor?: number | null;
  forceOff?: boolean;
  bloomRequested?: BloomPolicyInput['requested'];
  iridescenceRequested?: IridescencePolicyInput['requested'];
};

export type RuntimeOpticsPolicyTelemetry = {
  bloomPolicyState: BloomPolicy['state'];
  iridescencePolicyState: IridescencePolicy['state'];
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
};

export type RuntimeOpticsPolicy = {
  bloomPolicy: BloomPolicy;
  iridescencePolicy: IridescencePolicy;
  telemetry: RuntimeOpticsPolicyTelemetry;
};

export function resolveRuntimeOpticsPolicy(
  input: RuntimeOpticsPolicyInput = {},
): RuntimeOpticsPolicy {
  const bloomPolicy = resolveBloomPolicy({
    qualityProfile: input.qualityProfile,
    ritualEnergy: input.ritualEnergy,
    safetyFactor: input.safetyFactor,
    forceOff: input.forceOff,
    requested: input.bloomRequested,
  });

  const iridescencePolicy = resolveIridescencePolicy({
    qualityProfile: input.qualityProfile,
    ritualState: input.ritualState,
    safetyFactor: input.safetyFactor,
    forceOff: input.forceOff,
    requested: input.iridescenceRequested,
  });

  return {
    bloomPolicy,
    iridescencePolicy,
    telemetry: {
      bloomPolicyState: bloomPolicy.state,
      iridescencePolicyState: iridescencePolicy.state,
      bloomStrength: bloomPolicy.strength,
      bloomRadius: bloomPolicy.radius,
      bloomThreshold: bloomPolicy.threshold,
    },
  };
}