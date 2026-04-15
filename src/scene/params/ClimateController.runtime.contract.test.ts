import { describe, expect, it } from 'vitest';
import { ClimateController } from './ClimateController';

describe('ClimateController runtime telemetry contract', () => {
  it('tracks setProgress and update(dtMs) in a stable runtime telemetry object', () => {
    const controller = new ClimateController({ seed: 'runtime-contract' });

    controller.setProgress(0.42);
    controller.update(1234);

    const telemetry = controller.getRuntimeTelemetry();

    expect(telemetry.version).toBe('climate-runtime-v1');
    expect(telemetry.lastProgress).toBeCloseTo(0.42, 6);
    expect(telemetry.lastDtMs).toBe(1234);
    expect(telemetry.updateCount).toBe(1);
    expect(typeof telemetry.lastUpdatedAtMs).toBe('number');
    expect(telemetry.lastUpdatedAtMs).not.toBeNull();
    expect(telemetry.targetsVersion).toBe(1);
    expect(telemetry.lastTargetsSnapshot).toBeDefined();
    expect(telemetry.lastTargetsSnapshot?.presetName).toEqual(
      controller.getTargets().presetName,
    );
  });

  it('increments updateCount and targetsVersion across successive updates', () => {
    const controller = new ClimateController({ seed: 'runtime-increment' });

    controller.setProgress(0.2);
    controller.update(16);

    const first = controller.getRuntimeTelemetry();

    controller.setProgress(0.7);
    controller.update(33);

    const second = controller.getRuntimeTelemetry();

    expect(second.updateCount).toBe(first.updateCount + 1);
    expect(second.targetsVersion).toBe(first.targetsVersion + 1);
    expect(second.lastDtMs).toBe(33);
    expect(second.lastProgress).toBeCloseTo(0.7, 6);
    expect(second.lastTargetsSnapshot).toBeDefined();
  });

  it('exposes a coherent targets snapshot even before the first update', () => {
    const controller = new ClimateController({ seed: 'runtime-preupdate' });

    controller.setProgress(0.15);
    const targets = controller.getTargets();
    const telemetry = controller.getRuntimeTelemetry();

    expect(targets).toBeDefined();
    expect(telemetry.version).toBe('climate-runtime-v1');
    expect(telemetry.lastProgress).toBeCloseTo(0.15, 6);
    expect(telemetry.lastDtMs).toBeNull();
    expect(telemetry.updateCount).toBe(0);
    expect(telemetry.targetsVersion).toBe(0);
    expect(telemetry.lastTargetsSnapshot).toBeDefined();
    expect(telemetry.lastTargetsSnapshot?.presetName).toBe(targets.presetName);
  });
});
