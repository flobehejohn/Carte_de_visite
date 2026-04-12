/* @vitest-environment jsdom */
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OracleReadingPanel } from './OracleReadingPanel';

// 1. Mock du contexte (Source unique de vérité)
const useOracleMock = vi.fn();
vi.mock('../../context/OracleContext', () => ({
  useOracleContext: () => useOracleMock(),
}));

// 2. Mock du pont d'interaction
vi.mock('../../domain/oracleText/InteractionBridge', () => ({
  oracleInteractionBridge: {
    setFocus: vi.fn(),
    clearFocus: vi.fn(),
  },
}));

// 3. Mock de framer-motion pour JSDOM
vi.mock('framer-motion', async () => {
  const makeMotion = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const {
        animate,
        exit,
        initial,
        transition,
        layout,
        whileHover,
        whileTap,
        variants,
        ...rest
      } = props;
      return React.createElement(tag, { ...rest, ref }, props.children);
    });
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: makeMotion('div'),
      button: makeMotion('button'),
      p: makeMotion('p'),
      h2: makeMotion('h2'),
      span: makeMotion('span'),
    },
  };
});

describe('OracleReadingPanel (Phase 8)', () => {
  it('se rend correctement avec la citation principale en HTML (Desktop & Mobile)', () => {
    useOracleMock.mockReturnValue({
      lastResult: {
        finalReveal: {
          quote: 'La lumière passe par les failles.',
          explanation_long: 'Le test est au vert.',
          citations: ['Source CI'],
        },
      },
    });

    const { container } = render(<OracleReadingPanel />);

    // L'HTML doit désormais contenir la citation lisible, la prose et la source (Architecture Phase 8)
    expect(container.textContent).toContain(
      'La lumière passe par les failles.',
    );
    expect(container.textContent).toContain('Le test est au vert.');
    expect(container.textContent).toContain('Source CI');
  });

  it('ne rend rien si le payload est vide (lastResult = null)', () => {
    useOracleMock.mockReturnValue({
      lastResult: null,
      reset: vi.fn(),
    });

    const { container } = render(<OracleReadingPanel />);
    expect(container.innerHTML).toBe('');
  });
});
