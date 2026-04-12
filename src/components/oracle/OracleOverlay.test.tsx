/**
 * @vitest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OracleOverlay } from './OracleOverlay';

describe('Thème F - UI Scénarisée & Cinématique (OracleOverlay)', () => {
  const mockPayloadLegacy = {
    chapter: 'LIVRE VII',
    quote: 'Le feu purifie tout.',
    interpretation: 'Une allégorie de la destruction créatrice.',
    author: 'Zarathoustra',
    keywords: ['Destruction'],
  };

  const mockPayloadGoverned = {
    hermeneutic: {
      chapter: 'LIVRE VII',
      quote: 'Le feu purifie tout.',
    },
    composition: {
      prose: 'Une allégorie de la destruction créatrice.',
    },
    author: 'Zarathoustra',
    keywords: ['Destruction'],
  };

  it("Garantit l'invisibilité au montage (laissant la place à la 3D)", () => {
    vi.useFakeTimers();
    render(<OracleOverlay progress={1.0} payload={mockPayloadGoverned} />);

    expect(screen.getByTestId('oracle-overlay')).toBeDefined();

    const interpretationText = screen.getByText(
      'Une allégorie de la destruction créatrice.',
    );
    expect(interpretationText.parentElement?.style.opacity).toBe('0');

    vi.useRealTimers();
  });

  it("Garantit la distinction sémantique et l'apparition différée (Legacy)", () => {
    vi.useFakeTimers();
    render(<OracleOverlay progress={1.0} payload={mockPayloadLegacy} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const interpretationText = screen.getByText(
      'Une allégorie de la destruction créatrice.',
    );
    expect(interpretationText.parentElement?.style.opacity).toBe('1');

    // La citation "Le feu purifie tout." a disparu de l'HTML (envoyée en 3D)
    expect(screen.queryByText(/Le feu purifie tout/i)).toBeNull();

    expect(screen.getByText('Destruction')).toBeDefined();

    vi.useRealTimers();
  });

  it("Garantit la distinction sémantique et l'apparition différée (Governed)", () => {
    vi.useFakeTimers();
    render(<OracleOverlay progress={1.0} payload={mockPayloadGoverned} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const interpretationText = screen.getByText(
      'Une allégorie de la destruction créatrice.',
    );
    expect(interpretationText.parentElement?.style.opacity).toBe('1');
    expect(screen.queryByText(/Le feu purifie tout/i)).toBeNull();

    vi.useRealTimers();
  });
});
