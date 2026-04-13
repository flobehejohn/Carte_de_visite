/* @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RitualWizard from './RitualWizard';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const useOracleMock = vi.fn();

vi.mock('../../context/OracleContext', () => ({
  useOracleContext: () => useOracleMock(),
}));

vi.mock('../../domain/oracleText/InteractionBridge', () => ({
  oracleInteractionBridge: {
    clearFocus: vi.fn(),
    setFocus: vi.fn(),
  },
}));

vi.mock('./Oracle3DScene', () => ({
  Oracle3DScene: () => <div data-testid="oracle-scene" />,
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  const makeMotion = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const {
        animate,
        exit,
        initial,
        transition,
        whileHover,
        whileTap,
        layout,
        ...rest
      } = props;
      return React.createElement(tag, { ...rest, ref }, props.children);
    });
  return {
    ...(actual as any),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: makeMotion('div'),
      button: makeMotion('button'),
      p: makeMotion('p'),
    },
  };
});

const baseOracleResult = {
  quote: 'La vérité est un marteau.',
  interpretation: 'Brise tes illusions.',
  visualParams: {
    primary_color: '#ff0000',
    chaos: 0.5,
    fog_density: 0.5,
    shape_archetype: 'torusKnot',
  },
  finalReveal: {
    quote: 'La vérité est un marteau.',
    interpretation: 'Brise tes illusions.',
    explanation_long: 'Parole oracle complète',
    chapter: 'RÉVÉLATION',
    author: 'Zarathoustra',
    citations: ['Ainsi parlait'],
  },
};

function buildOracleContext(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    lastResult: baseOracleResult,
    error: null,
    guidanceLoading: false,
    lastGuidance: null,
    clearGuidance: vi.fn(),
    drawFromRitual: vi.fn(),
    checkStep: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('RitualWizard - Result Rendering', () => {
  beforeEach(() => {
    useOracleMock.mockReset();
  });

  it('rend immédiatement le panneau de révélation et le bouton Contempler en mode isE2E=true', () => {
    useOracleMock.mockReturnValue(buildOracleContext());
    render(<RitualWizard isE2E={true} />);

    expect(screen.getByTestId('reveal-panel')).toBeTruthy();
    expect(screen.getByTestId('reveal-quote').textContent).toContain(
      'La vérité est un marteau.',
    );
    expect(screen.getByRole('button', { name: /Contempler/i })).toBeTruthy();
    expect(screen.getByText(/Ainsi parlait/i)).toBeTruthy();
  });

  it('fallback proprement vers les anchors herméneutiques quand les citations finales sont absentes', () => {
    useOracleMock.mockReturnValue(
      buildOracleContext({
        lastResult: {
          ...baseOracleResult,
          finalReveal: { ...baseOracleResult.finalReveal, citations: [] },
          citations: [],
          hermeneutic: { anchors: [{ claim: 'Deviens qui tu es' }] },
        },
      }),
    );

    render(<RitualWizard isE2E={true} />);
    expect(screen.getByText(/Deviens qui tu es/i)).toBeTruthy();
    expect(
      screen.queryByText(/La source originelle n'a pu être transcrite/i),
    ).toBeNull();
  });

  it('bascule en immersion puis revient proprement au panneau texte', () => {
    useOracleMock.mockReturnValue(buildOracleContext());
    render(<RitualWizard isE2E={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Contempler/i }));
    expect(screen.getByTestId('immersion-overlay')).toBeTruthy();
    expect(screen.getByTestId('immersion-quote').textContent).toContain(
      'La vérité est un marteau.',
    );
    expect(screen.queryByTestId('reveal-panel')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Retour au Verbe/i }));
    expect(screen.getByTestId('reveal-panel')).toBeTruthy();
  });
});
