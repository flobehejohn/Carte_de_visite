/* @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetOrbDebugForTests, orbError, orbLog, orbWarn } from './orbDebug';

type DebugBufferEntry = {
  ts: number;
  level: 'info' | 'warn' | 'error';
  namespace: string;
  message: string;
  args: unknown[];
  audit: boolean;
  visible: boolean;
};

function getBuffer(): DebugBufferEntry[] {
  return ((globalThis as any).__ORB_DEBUG_BUFFER__ ?? []) as DebugBufferEntry[];
}

describe('orbDebug - contrat de base', () => {
  beforeEach(() => {
    __resetOrbDebugForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetOrbDebugForTests();
  });

  it('orbLog reste silencieux par défaut mais alimente le buffer et le statusHandler', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const statusHandler = vi.fn();

    orbLog(
      'FluidParticles',
      'Reset particules fluide.',
      {
        ctx: { statusHandler },
      },
      { count: 0 },
    );

    expect(infoSpy).not.toHaveBeenCalled();
    expect(statusHandler).toHaveBeenCalledTimes(1);
    expect(statusHandler).toHaveBeenCalledWith(
      'Reset particules fluide.',
      'info',
    );

    const buffer = getBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toMatchObject({
      level: 'info',
      namespace: 'FluidParticles',
      message: 'Reset particules fluide.',
      audit: false,
      visible: false,
    });
    expect(buffer[0].args).toEqual([{ count: 0 }]);
    expect(typeof buffer[0].ts).toBe('number');
  });

  it('orbWarn et orbError restent visibles quoi qu’il arrive', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const statusHandler = vi.fn();

    orbWarn(
      'Oracle3DScene',
      'feedback scan failed',
      {
        ctx: { statusHandler },
      },
      new Error('scan failed'),
    );

    orbError(
      'Oracle3DScene',
      'animate error',
      {
        ctx: { statusHandler },
      },
      new Error('animate exploded'),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toBe(
      '[Oracle3DScene] feedback scan failed',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toBe('[Oracle3DScene] animate error');

    expect(statusHandler).toHaveBeenNthCalledWith(
      1,
      'feedback scan failed',
      'warn',
    );
    expect(statusHandler).toHaveBeenNthCalledWith(2, 'animate error', 'error');

    const buffer = getBuffer();
    expect(buffer).toHaveLength(2);
    expect(buffer[0]).toMatchObject({
      level: 'warn',
      namespace: 'Oracle3DScene',
      message: 'feedback scan failed',
      visible: true,
    });
    expect(buffer[1]).toMatchObject({
      level: 'error',
      namespace: 'Oracle3DScene',
      message: 'animate error',
      visible: true,
    });
  });

  it('emitStatus=false coupe le statusHandler sans perdre la trace buffer', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const statusHandler = vi.fn();

    orbLog('Climate', 'preset=Aurore', {
      ctx: { statusHandler },
      emitStatus: false,
      visible: true,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(statusHandler).not.toHaveBeenCalled();

    const buffer = getBuffer();
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toMatchObject({
      namespace: 'Climate',
      message: 'preset=Aurore',
      level: 'info',
      visible: true,
    });
  });
});
