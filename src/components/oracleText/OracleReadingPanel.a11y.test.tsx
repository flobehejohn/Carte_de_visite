/**
 * @vitest-environment jsdom
 */
import { fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useOracleContext } from '../../context/OracleContext';
import { OracleReadingPanel } from './OracleReadingPanel';

// Mock du Contexte
vi.mock('../../context/OracleContext', () => ({
  useOracleContext: vi.fn(),
}));

// Mock propre de framer-motion pour JSDOM
vi.mock('framer-motion', async () => {
  const makeMotion = (tag: string) =>
    React.forwardRef<any, any>((props, ref) => {
      const { animate, exit, initial, transition, layout, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, props.children);
    });
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    motion: {
      div: makeMotion('div'),
      button: makeMotion('button'),
      h2: makeMotion('h2'),
    },
  };
});

describe('OracleReadingPanel - Contrats UI & Accessibilité (Sprint 2.2)', () => {
  const mockReset = vi.fn();

  const mockResult = {
    finalReveal: {
      chapter: 'LIVRE I',
      author: 'Zarathoustra',
      quote: 'Je vous enseigne le Surhumain.',
      central_tension: "L'homme est une corde.",
      reversal: 'Il faut la tendre.',
      explanation_long: 'Voici le sens profond de votre rituel.',
      citations: ['Ainsi parlait Zarathoustra'],
    },
  };

  it('affiche les éléments sémantiques avec les bons data-testid pour Playwright', () => {
    (useOracleContext as any).mockReturnValue({
      lastResult: mockResult,
      reset: mockReset,
    });

    const { getByTestId, getByText } = render(<OracleReadingPanel />);

    // Vérification des attributs de région ARIA
    const panel = getByTestId('reveal-panel');
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-label')).toBe(
      "Révélation finale de l'Oracle",
    );

    // Vérification des marqueurs de contenu (Golden Path des Tests E2E)
    expect(getByTestId('reveal-quote').textContent).toContain('Surhumain');
    expect(getByTestId('reveal-prose').textContent).toContain('sens profond');
    expect(getByTestId('reveal-sources').textContent).toContain(
      'Ainsi parlait',
    );

    // Vérification de l'affichage des métadonnées
    expect(getByText('LIVRE I')).toBeDefined();
    expect(getByText(/L'homme est une corde/i)).toBeDefined();
  });

  it('déclenche la fonction reset du contexte lors du clic sur le bouton final', () => {
    (useOracleContext as any).mockReturnValue({
      lastResult: mockResult,
      reset: mockReset,
    });

    const { getByTestId } = render(<OracleReadingPanel />);

    const resetBtn = getByTestId('btn-restart');
    fireEvent.click(resetBtn);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
