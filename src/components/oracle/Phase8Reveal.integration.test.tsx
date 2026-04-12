/**
 * @vitest-environment jsdom
 */
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OracleProvider, useOracleContext } from '../../context/OracleContext';

const MockWizard = () => {
  const { drawFromRitual } = useOracleContext();
  return (
    <button
      data-testid="trigger"
      onClick={() => drawFromRitual({ nameOrNickname: 'X' } as any)}
    >
      Go
    </button>
  );
};
const MockPanel = () => {
  const { lastResult } = useOracleContext();
  return (
    <div data-testid="panel">{lastResult?.finalReveal?.quote || 'Vide'}</div>
  );
};

vi.mock('../../services/zarathustraService', () => ({
  consultOracle: vi
    .fn()
    .mockResolvedValue({ finalReveal: { quote: 'Test Partagé' } }),
  getStepGuidance: vi.fn(),
}));

describe('Phase 8 - Intégration OracleContext P0', () => {
  it('garantit que le Wizard et le Panel partagent la même instance d état (Single Truth)', async () => {
    const { getByTestId, findByTestId } = render(
      <OracleProvider>
        <MockWizard />
        <MockPanel />
      </OracleProvider>,
    );
    expect(getByTestId('panel').textContent).toBe('Vide');
    act(() => {
      getByTestId('trigger').click();
    });
    const panel = await findByTestId('panel');
    expect(panel.textContent).toBe('Test Partagé');
  });
});
