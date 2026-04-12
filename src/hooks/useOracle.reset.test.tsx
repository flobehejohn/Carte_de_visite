/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as zarathustraService from '../services/zarathustraService';
import { useOracle } from './useOracle';

vi.mock('../services/zarathustraService', () => ({
  consultOracle: vi.fn(),
  getStepGuidance: vi.fn(),
}));

describe('useOracle - Reset Implacable P0', () => {
  it('annihile strictement une requête en vol via l invalidation d epoch (requestIdRef)', async () => {
    let resolveApi: any;
    vi.mocked(zarathustraService.consultOracle).mockImplementation(
      () =>
        new Promise((r) => {
          resolveApi = r;
        }),
    );
    const { result } = renderHook(() => useOracle());

    act(() => {
      result.current.drawFromRitual({} as any);
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveApi({ finalReveal: { quote: 'Fantome' } });
    });
    expect(result.current.lastResult).toBeNull();
  });
});
