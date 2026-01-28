import { describe, it, expect } from "vitest";
import { RitualOrchestrator } from "./RitualOrchestrator";

describe("RitualOrchestrator — opacity wiring", () => {
  it("applique targets.opacity vers les multiplicateurs (wire/particles/foreground)", () => {
    const ctx = {};
    const orch = new RitualOrchestrator(ctx);

    orch.applyTargetsToRuntime(
      ctx,
      {
        opacity: {
          wireOpacityMul: 0.5,
          particlesOpacityMul: 0.25,
          foregroundOpacity: 0.1,
        },
      },
      1.0
    );

    expect(orch._climateWireOpacityMul).toBeCloseTo(0.5);
    expect(orch._climateParticlesOpacityMul).toBeCloseTo(0.25);
    expect(orch._climateForegroundOpacity).toBeCloseTo(0.1);
  });
});
