/* @vitest-environment jsdom */

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('OrbAuditBridge snapshot merge contract', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as any).__ORB_AUDIT__;
    delete (window as any).__ORB_AUDIT_READY__;
  });

  afterEach(() => {
    delete (window as any).__ORB_AUDIT__;
    delete (window as any).__ORB_AUDIT_READY__;
    vi.restoreAllMocks();
  });

  async function loadBridge() {
    return await import('./OrbAuditBridge');
  }

  it('initialise un contrat minimal synchrone si aucun bridge n’existe encore', async () => {
    expect((window as any).__ORB_AUDIT__).toBeUndefined();

    await loadBridge();

    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge).toBeDefined();
    expect(typeof bridge.timestamp).toBe('number');

    expect(bridge.invariants).toBeDefined();
    expect(bridge.invariants.optics).toEqual({
      volumeBackgroundDepthWrite: false,
      volumeGlowDepthWrite: false,
      volumeGlowIsAdditive: true,
      particlesPointsDepthWrite: false,
      particlesLinksDepthWrite: false,
      particlesTrailsDepthWrite: false,
      fluidParticlesDepthWrite: false,
    });

    expect(bridge.invariants.scene).toEqual({
      isEmergencyMode: false,
      particlesMode: 'points',
    });
  });

  it('préserve un bridge riche existant et ne remplace pas snapshot/ready/setters', async () => {
    const richSnapshot = vi.fn(() => ({
      telemetry: { meanFrameTime: 16.7 },
      sceneStats: { rendererCalls: 42 },
    }));
    const ready = vi.fn(() => true);
    const setRenderMode = vi.fn();

    (window as any).__ORB_AUDIT__ = {
      ready,
      snapshot: richSnapshot,
      setRenderMode,
      customField: { source: 'oracle3dscene' },
      invariants: {
        optics: {
          legacyOpticFlag: true,
        },
        scene: {
          legacySceneFlag: true,
        },
      },
    };

    const { OrbAuditBridge } = await loadBridge();

    const ctx = {
      runtimeFlags: { emergencyMode: true },
      particlesConfig: { mode: 'links' },
      volumeState: {
        backgroundMaterial: { depthWrite: false },
        glowMaterial: {
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        },
      },
      particlesPoints: {
        material: { depthWrite: false },
      },
      particlesLinks: {
        material: { depthWrite: true },
      },
      particlesTrails: {
        material: { depthWrite: false },
      },
      fluidParticlesState: {
        mesh: {
          material: { depthWrite: false },
        },
      },
    };

    OrbAuditBridge.captureRuntimeState(ctx);

    const bridge = (window as any).__ORB_AUDIT__;

    expect(bridge.ready).toBe(ready);
    expect(bridge.snapshot).toBe(richSnapshot);
    expect(bridge.setRenderMode).toBe(setRenderMode);
    expect(bridge.customField).toEqual({ source: 'oracle3dscene' });

    expect(bridge.invariants.optics.legacyOpticFlag).toBe(true);
    expect(bridge.invariants.scene.legacySceneFlag).toBe(true);

    expect(bridge.invariants.optics.volumeBackgroundDepthWrite).toBe(false);
    expect(bridge.invariants.optics.volumeGlowDepthWrite).toBe(false);
    expect(bridge.invariants.optics.volumeGlowIsAdditive).toBe(true);
    expect(bridge.invariants.optics.particlesPointsDepthWrite).toBe(false);
    expect(bridge.invariants.optics.particlesLinksDepthWrite).toBe(true);
    expect(bridge.invariants.optics.particlesTrailsDepthWrite).toBe(false);
    expect(bridge.invariants.optics.fluidParticlesDepthWrite).toBe(false);

    expect(bridge.invariants.scene.isEmergencyMode).toBe(true);
    expect(bridge.invariants.scene.particlesMode).toBe('links');
    expect(typeof bridge.timestamp).toBe('number');
  });

  it('met à jour uniquement invariants et conserve intact le résultat de snapshot()', async () => {
    const snapshotResult = {
      telemetry: {
        meanFrameTime: 18.2,
        p95: 24.9,
      },
      dom: {
        canvasAttached: true,
      },
    };

    const snapshot = vi.fn(() => snapshotResult);

    (window as any).__ORB_AUDIT__ = {
      ready: () => true,
      snapshot,
      domController: {
        reset: vi.fn(),
      },
    };

    const { OrbAuditBridge } = await loadBridge();

    OrbAuditBridge.captureRuntimeState({
      runtimeFlags: { emergencyMode: false },
      particlesConfig: { mode: 'points' },
    });

    const bridge = (window as any).__ORB_AUDIT__;

    expect(bridge.snapshot).toBe(snapshot);
    expect(bridge.snapshot()).toEqual(snapshotResult);
    expect(bridge.domController).toBeDefined();

    expect(bridge.invariants.scene.isEmergencyMode).toBe(false);
    expect(bridge.invariants.scene.particlesMode).toBe('points');
  });

  it('supporte un ctx partiel avec des fallbacks stables sans introduire de nulls dangereux', async () => {
    const { OrbAuditBridge } = await loadBridge();

    OrbAuditBridge.captureRuntimeState({
      runtimeFlags: {},
      particlesConfig: {},
    });

    const bridge = (window as any).__ORB_AUDIT__;

    expect(bridge.invariants.optics).toEqual({
      volumeBackgroundDepthWrite: false,
      volumeGlowDepthWrite: false,
      volumeGlowIsAdditive: true,
      particlesPointsDepthWrite: false,
      particlesLinksDepthWrite: false,
      particlesTrailsDepthWrite: false,
      fluidParticlesDepthWrite: false,
    });

    expect(bridge.invariants.scene).toEqual({
      isEmergencyMode: false,
      particlesMode: 'points',
    });
  });

  it('n’écrase pas le bridge existant quand captureRuntimeState est appelée avec un ctx vide', async () => {
    const ready = vi.fn(() => true);
    const snapshot = vi.fn(() => ({ ok: true }));

    (window as any).__ORB_AUDIT__ = {
      ready,
      snapshot,
      custom: { keep: true },
    };

    const { OrbAuditBridge } = await loadBridge();

    OrbAuditBridge.captureRuntimeState(undefined as any);

    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge.ready).toBe(ready);
    expect(bridge.snapshot).toBe(snapshot);
    expect(bridge.custom).toEqual({ keep: true });
    expect(bridge.invariants).toBeDefined();
    expect(bridge.invariants.scene.particlesMode).toBe('points');
  });

  it('résout le matériau fluide depuis fluidParticlesState.mesh en priorité', async () => {
    const { OrbAuditBridge } = await loadBridge();

    OrbAuditBridge.captureRuntimeState({
      runtimeFlags: { emergencyMode: false },
      particlesConfig: { mode: 'points' },
      fluidParticlesState: {
        mesh: {
          material: { depthWrite: true },
        },
      },
      fluidParticlesMesh: {
        material: { depthWrite: false },
      },
      fluidParticles: {
        material: { depthWrite: false },
      },
    });

    const bridge = (window as any).__ORB_AUDIT__;
    expect(bridge.invariants.optics.fluidParticlesDepthWrite).toBe(true);
  });

  it('retombe sur fluidParticlesMesh puis fluidParticles si fluidParticlesState.mesh est absent', async () => {
    const { OrbAuditBridge } = await loadBridge();

    OrbAuditBridge.captureRuntimeState({
      runtimeFlags: { emergencyMode: false },
      particlesConfig: { mode: 'points' },
      fluidParticlesMesh: {
        material: { depthWrite: true },
      },
    });

    let bridge = (window as any).__ORB_AUDIT__;
    expect(bridge.invariants.optics.fluidParticlesDepthWrite).toBe(true);

    OrbAuditBridge.captureRuntimeState({
      runtimeFlags: { emergencyMode: false },
      particlesConfig: { mode: 'points' },
      fluidParticles: {
        material: { depthWrite: false },
      },
    });

    bridge = (window as any).__ORB_AUDIT__;
    expect(bridge.invariants.optics.fluidParticlesDepthWrite).toBe(false);
  });
});
