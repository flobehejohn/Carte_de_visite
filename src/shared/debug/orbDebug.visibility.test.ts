/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOrbDebugForTests, orbError, orbLog, orbWarn } from './orbDebug';

describe('orbDebug - visibilité', () => {
  beforeEach(() => {
    __resetOrbDebugForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetOrbDebugForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('visible=true force l’affichage même sans verbose', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    orbLog('Oracle3DScene', 'bridge ready', {
      visible: true,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toBe('[Oracle3DScene] bridge ready');
  });

  it('le mode verbose global réactive les logs info', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    (globalThis as any).__ORB_VERBOSE__ = true;

    orbLog('Climate', 'preset=Cendre');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toBe('[Climate] preset=Cendre');
  });

  it('le mode verbose via localStorage réactive les logs info', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    localStorage.setItem('ORB_VERBOSE', 'true');

    orbLog('FluidParticles', 'Rebuild instanced mesh.');

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toBe(
      '[FluidParticles] Rebuild instanced mesh.',
    );
  });

  it('un log audit reste silencieux par défaut puis devient visible en audit verbose', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    orbLog('AUDIT', 'bridge ready', {
      audit: true,
    });

    expect(infoSpy).not.toHaveBeenCalled();

    (globalThis as any).__ORB_AUDIT_VERBOSE__ = true;

    orbLog('AUDIT', 'bridge ready', {
      audit: true,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toBe('[AUDIT] bridge ready');
  });

  it('warn/error restent visibles indépendamment du mode verbose', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    orbWarn('FluidParticles', 'Simplex fallback used frequently.');
    orbError('Oracle3DScene', 'animate error');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe(
      '[FluidParticles] Simplex fallback used frequently.',
    );

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('[Oracle3DScene] animate error');
  });
});
