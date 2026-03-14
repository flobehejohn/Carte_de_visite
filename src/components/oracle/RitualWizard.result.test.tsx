/* @vitest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useOracleMock = vi.fn();

vi.mock('../../hooks/useOracle', () => {
  return {
    useOracle: () => useOracleMock(),
  };
});

vi.mock('./Oracle3DScene', () => {
  return {
    Oracle3DScene: () => <div data-testid="oracle-scene" />,
  };
});

vi.mock('framer-motion', async () => {
  const makeMotion = (tag: 'div' | 'button') =>
    React.forwardRef<any, any>((props, ref) => {
      const {
        animate,
        exit,
        initial,
        transition,
        whileHover,
        whileTap,
        ...rest
      } = props;
      return React.createElement(tag, { ...rest, ref }, props.children);
    });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: makeMotion('div'),
      button: makeMotion('button'),
    },
  };
});

import RitualWizard from './RitualWizard';

const mockResult = {
  sentence: {
    id: '5190',
    text: 'Zarathoustra le danseur...',
    part_title: 'QUATRIEME ET DERNIERE PARTIE',
    section_title: 'DE L HOMME SUPERIEUR',
  },
  quote:
    'Florian, ton nom repond comme une flamme legere au-dessus du poids.',
  interpretation:
    'Ton nom devient ici un signe de legerete et de depassement. Zarathoustra t y convoque comme un pont vers une aurore plus haute.',
  keywords: ['legerete', 'depassement', 'aurore'],
  ritual: {
    nameOrNickname: 'florian',
    mood: 'curieux',
    format: 'Conseil',
    questionText: 'Que signifie mon nom dans le rite ?',
    weight: '',
    fear: '',
    desire: '',
    sacrifice: '',
    social: '',
    eternity: '',
  },
  tone: { sentiment: 0.5, intensity: 1, mysticism: 0.7 },
  themeScores: [],
  visualParams: {
    primary_color: '#ffd700',
    chaos: 0.4,
    fog_density: 0.15,
    shape_archetype: 'spiral',
  },
  textLength: 180,
  seed: 'oracle-seed',
  mainTheme: { themeId: 'will', score: 1, label: 'Volonte' },
};

describe('RitualWizard result rendering', () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    root = null;
    container = document.createElement('div');
    document.body.appendChild(container);

    (globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };

    useOracleMock.mockReturnValue({
      loading: false,
      error: null,
      lastResult: mockResult,
      drawFromRitual: vi.fn(),
      checkStep: vi.fn(),
      guidanceLoading: false,
      lastGuidance:
        "Le nom 'florian' seul n'apporte pas de sens ou de contexte pour etre acceptable dans un rituel.",
      clearGuidance: vi.fn(),
      reset: vi.fn(),
    });
  });

  afterEach(() => {
    if (root) {
      React.act(() => {
        root?.unmount();
      });
    }
    container.remove();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders the final oracle fields instead of the guard message when lastResult exists', async () => {
    await React.act(async () => {
      root = createRoot(container);
      root.render(<RitualWizard />);
    });

    await React.act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(container.textContent).toContain(mockResult.quote);
    expect(container.textContent).toContain(mockResult.interpretation);
    expect(container.textContent).not.toContain(
      "Le nom 'florian' seul n'apporte pas de sens",
    );
  });
});
