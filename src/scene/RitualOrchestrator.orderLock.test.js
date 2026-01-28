// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("./modules/orbFluidParticles.js", () => ({ updateFluidParticles: vi.fn() }));
vi.mock("./modules/orbGeometry.js", () => ({
  setRitualConfig: vi.fn(),
  createPolyhedron: vi.fn(),
  setShapeType: vi.fn(),
  setPolyDetail: vi.fn(),
  setDeformAmplitude: vi.fn(),
  deformPolyhedron: vi.fn(),
  updateWireframeStyle: vi.fn(),
}));
vi.mock("./modules/orbGround.js", () => ({ updateGroundDeformation: vi.fn() }));
vi.mock("./modules/orbLighting.js", () => ({ setLightConfig: vi.fn(), updateLightsForFrame: vi.fn() }));
vi.mock("./modules/orbParticles.js", () => ({
  setParticlesConfig: vi.fn(),
  animateParticles: vi.fn(),
  updateParticleLinks: vi.fn(),
  updateParticleTrails: vi.fn(),
}));
vi.mock("./modules/orbPoly.js", () => ({ setPolyConfig: vi.fn(), updatePolyDeformation: vi.fn() }));
vi.mock("./modules/orbVolumes.js", () => ({
  ensureVolumeConfig: vi.fn(() => ({ glowIntensity: 0, backgroundStrength: 0 })),
  updateVolumeForFrame: vi.fn(),
}));
vi.mock("./render/materials/mapClimateToRenderParams", () => ({
  mapClimateToRenderParams: vi.fn(() => ({
    presetName: "Mock",
    fog: { enabled: false, density: 0, color: 0 },
    bloom: { strength: 0, radius: 0, threshold: 0 },
    volume: { glowIntensity: 0, backgroundStrength: 0, softness: 0, vignette: 0, bgColor: 0, glowColor: 0 },
    opacity: { wireOpacityMul: 1, particlesOpacityMul: 1, foregroundOpacity: 0 },
    optics: {
      alpha: 1,
      transmission: 0,
      thickness: 0.1,
      ior: 1.35,
      roughness: 0.4,
      clearcoat: 0,
      scattering: 0,
      absorption: 0,
    },
  })),
}));
vi.mock("./render/materials/applyMaterials", () => ({ applyMaterials: vi.fn() }));
vi.mock("./params/ClimateController", () => ({ ClimateController: vi.fn() }));

function pickCtor(mod) {
  if (typeof mod?.default === "function") return mod.default;
  if (typeof mod?.RitualOrchestrator === "function") return mod.RitualOrchestrator;
  const keys = Object.keys(mod || {});
  for (const key of keys) {
    if (typeof mod[key] === "function") return mod[key];
  }
  throw new Error(`No constructor export found. Exports: ${keys.join(", ")}`);
}

describe("RitualOrchestrator — order lock (Climate → Safety)", () => {
  it("applique d'abord ClimateTargets, puis SafetyFactor, puis ré-applique avec clamp", async () => {
    const mod = await import("./RitualOrchestrator");
    const RitualOrchestrator = pickCtor(mod);
    const o = new RitualOrchestrator({});

    // --- Stubs minimaux pour éviter les dépendances lourdes
    o.ctx = o.ctx || {};
    o.ctx.climateTargets = null;

    // Climate
    const fakeTargets = { bloom: { strength: 0.5 }, fog: { enabled: true, density: 0.02 } };
    o.ctx.climateController = {
      setProgress: vi.fn(),
      update: vi.fn(),
      getTargets: vi.fn(() => fakeTargets),
    };

    // Safety
    const fakeSafety = {
      safetyFactor: 0.42,
      bloomClamp: { strength: { min: 0, max: 0.2 } },
    };
    o.ctx.lightSafetyGovernor = {
      update: vi.fn(() => fakeSafety),
    };

    // Spy order on applyTargetsToRuntime WITHOUT executing real body
    const calls = [];
    o.applyTargetsToRuntime = vi.fn((ctx, targets, safetyFactor, bloomClamp) => {
      calls.push({ ctx, targets, safetyFactor, bloomClamp });
    });

    // --- Déclenche le bloc “frame/update”
    // IMPORTANT: adapte le nom si ta méthode s'appelle différemment (updateFrame, update, tick, etc.)
    // Le test doit appeler la méthode qui fait:
    //   climateTargets = climateController.getTargets()
    //   applyTargetsToRuntime(...targets)
    //   safety = governor.update(...)
    //   applyTargetsToRuntime(...targets, safetyFactor, bloomClamp)
    const dtMs = 16;

    // Tentatives compatibles :
    if (typeof o.update === "function") o.update(dtMs);
    else if (typeof o.updateFrame === "function") o.updateFrame(dtMs);
    else if (typeof o.tick === "function") o.tick(dtMs);
    else throw new Error("Aucune méthode update/updateFrame/tick trouvée sur RitualOrchestrator");

    // --- Assertions ordre
    expect(o.ctx.climateController.getTargets).toHaveBeenCalledTimes(1);
    expect(o.ctx.lightSafetyGovernor.update).toHaveBeenCalledTimes(1);

    expect(o.applyTargetsToRuntime).toHaveBeenCalledTimes(2);

    // 1er apply: sans safetyFactor explicite
    expect(calls[0].targets).toBe(fakeTargets);
    expect(calls[0].safetyFactor).toBeUndefined();
    expect(calls[0].bloomClamp).toBeUndefined();

    // 2e apply: avec safetyFactor + bloomClamp
    expect(calls[1].targets).toBe(fakeTargets);
    expect(calls[1].safetyFactor).toBe(fakeSafety.safetyFactor);
    expect(calls[1].bloomClamp).toBe(fakeSafety.bloomClamp);
  });
});
