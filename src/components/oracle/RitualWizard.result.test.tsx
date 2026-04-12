/* @vitest-environment jsdom */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
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

describe('RitualWizard - Result Rendering', () => {
  it('E2E Bypass Anti-Regression: Rend instantanément le panneau de révélation et le bouton Immersion en mode isE2E=true', async () => {
    useOracleMock.mockReturnValue({
      loading: false,
      lastResult: baseOracleResult,
      error: null,
      guidanceLoading: false,
      lastGuidance: null,
      clearGuidance: vi.fn(),
      drawFromRitual: vi.fn(),
      checkStep: vi.fn(),
      reset: vi.fn(),
    });

    render(<RitualWizard isE2E={true} />);

    expect(screen.getByTestId('reveal-panel')).toBeTruthy();
    expect(screen.getByTestId('reveal-quote').textContent).toContain(
      'La vérité est un marteau.',
    );

    // Le texte a été mis à jour vers "Contempler" dans la V2 de l'UI
    expect(screen.getByText(/Contempler/i)).toBeTruthy();
  });
});
