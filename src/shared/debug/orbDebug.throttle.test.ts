/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOrbDebugForTests, orbLog } from './orbDebug';

describe('orbDebug - throttle et once', () => {
  beforeEach(() => {
    __resetOrbDebugForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetOrbDebugForTests();
  });

  it('throttle bloque les répétitions pendant la fenêtre donnée', () => {
    let currentNow = 1000;

    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    orbLog('FluidParticles', 'Particules fluide: 12', {
      visible: true,
      key: 'fluid:count',
      throttleMs: 1000,
    });

    currentNow = 1500;
    orbLog('FluidParticles', 'Particules fluide: 13', {
      visible: true,
      key: 'fluid:count',
      throttleMs: 1000,
    });

    currentNow = 2201;
    orbLog('FluidParticles', 'Particules fluide: 14', {
      visible: true,
      key: 'fluid:count',
      throttleMs: 1000,
    });

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[0][0]).toBe(
      '[FluidParticles] Particules fluide: 12',
    );
    expect(infoSpy.mock.calls[1][0]).toBe(
      '[FluidParticles] Particules fluide: 14',
    );
  });

  it('once=true n’émet qu’une seule fois pour une même clé', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    orbLog('Light', 'Default lights initialized.', {
      visible: true,
      key: 'light:init-default',
      once: true,
    });

    orbLog('Light', 'Default lights initialized.', {
      visible: true,
      key: 'light:init-default',
      once: true,
    });

    orbLog('Light', 'Default lights initialized.', {
      visible: true,
      key: 'light:init-default',
      once: true,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toBe(
      '[Light] Default lights initialized.',
    );
  });

  it('deux clés différentes sont throttlées indépendamment', () => {
    let currentNow = 5000;

    vi.spyOn(performance, 'now').mockImplementation(() => currentNow);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    orbLog('FluidParticles', 'A', {
      visible: true,
      key: 'k:A',
      throttleMs: 1000,
    });

    orbLog('FluidParticles', 'B', {
      visible: true,
      key: 'k:B',
      throttleMs: 1000,
    });

    currentNow = 5200;

    orbLog('FluidParticles', 'A-2', {
      visible: true,
      key: 'k:A',
      throttleMs: 1000,
    });

    orbLog('FluidParticles', 'B-2', {
      visible: true,
      key: 'k:B',
      throttleMs: 1000,
    });

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[0][0]).toBe('[FluidParticles] A');
    expect(infoSpy.mock.calls[1][0]).toBe('[FluidParticles] B');
  });
});
