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
  const makeMotion = (tag: 'div' | 'button' | 'p') =>
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

import RitualWizard from './RitualWizard';

const baseRitual = {
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
};

const legacyQuote =
  'Florian, ton nom repond comme une flamme legere au-dessus du poids.';
const legacyInterpretation =
  'Ton nom devient ici un signe de legerete et de depassement.';
const governedProse =
  'Florian avance comme une flamme legere au-dessus du poids. Le nom devient un seuil tendu. Le retournement lui rend une forme de depassement. Reviens a cette aurore lorsque le poids se referme.';

const baseOracleResult = {
  sentence: {
    id: '5190',
    text: 'Zarathoustra le danseur...',
    part_title: 'QUATRIEME ET DERNIERE PARTIE',
    section_title: 'DE L HOMME SUPERIEUR',
  },
  quote: legacyQuote,
  interpretation: legacyInterpretation,
  keywords: ['legerete', 'depassement', 'aurore'],
  ritual: baseRitual,
  hermeneutic: {
    quote: legacyQuote,
    keywords: ['legerete', 'depassement', 'aurore'],
  },
  composition: {
    prose: governedProse,
    motifs: [
      {
        citation_id: '5190',
        role: 'anchor' as const,
        motif: 'flamme',
        claim: 'Le nom commence comme apparition.',
      },
    ],
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

function buildOracleHookState(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    error: null,
    lastResult: baseOracleResult,
    drawFromRitual: vi.fn(),
    checkStep: vi.fn(),
    guidanceLoading: false,
    lastGuidance: null,
    clearGuidance: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('RitualWizard governed rendering', () => {
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

  async function renderWizard(overrides: Record<string, unknown> = {}) {
    useOracleMock.mockReturnValue(buildOracleHookState(overrides));

    await React.act(async () => {
      root = createRoot(container);
      root.render(<RitualWizard />);
    });
  }

  async function flushTypewriter(ms = 8000) {
    await React.act(async () => {
      vi.advanceTimersByTime(ms);
    });
  }

  async function showGuardianGuidance(value = 'Jeanne') {
    const input = container.querySelector('input');
    expect(input).toBeTruthy();
    if (!input) return;

    await React.act(async () => {
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const confirmButton = buttons.find((button) =>
      button.textContent?.includes('Confirmer'),
    );

    expect(confirmButton).toBeTruthy();
    if (!confirmButton) return;

    await React.act(async () => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await flushTypewriter();
  }

  it('guardian displays guidance echo and subcomment when governed guidance is present', async () => {
    await renderWizard({
      lastResult: null,
      lastGuidance:
        '« Jeanne » ouvre un seuil sobre ; tu peux entrer sans te justifier.\n\nIci, le nom n est pas une piece a produire : il devient presence, apparition et premier passage.',
    });

    await showGuardianGuidance('Jeanne');

    expect(container.textContent).toContain(
      '« Jeanne » ouvre un seuil sobre ; tu peux entrer sans te justifier.',
    );
    expect(container.textContent).toContain(
      'Ici, le nom n est pas une piece a produire',
    );
  });

  it('guardian falls back to a plain legacy comment and does not crash when guidance is null', async () => {
    await renderWizard({
      lastResult: null,
      lastGuidance:
        'Jeanne ouvre un passage plus net ; le seuil peut maintenant recevoir ta parole.',
    });

    await showGuardianGuidance('Jeanne');

    expect(container.textContent).toContain(
      'Jeanne ouvre un passage plus net ; le seuil peut maintenant recevoir ta parole.',
    );

    if (root) {
      const currentRoot = root;
      React.act(() => {
        currentRoot.unmount();
      });
      root = null;
    }

    await renderWizard({
      lastResult: null,
      lastGuidance: null,
    });

    await showGuardianGuidance('Jeanne');

    expect(container.textContent).toContain('Le seuil reste ouvert.');
  });

  it('oracle prefers composition.prose over legacy interpretation in the final governed view', async () => {
    await renderWizard({
      lastResult: {
        ...baseOracleResult,
        interpretation: legacyInterpretation,
        composition: {
          prose: governedProse,
          motifs: [
            {
              citation_id: '5190',
              role: 'anchor',
              motif: 'flamme',
              claim: 'Le nom commence comme apparition.',
            },
          ],
        },
      },
      lastGuidance:
        "Le nom 'florian' seul n'apporte pas de sens ou de contexte pour etre acceptable dans un rituel.",
    });

    await flushTypewriter();

    expect(container.textContent).toContain(governedProse);
    expect(container.textContent).not.toContain(legacyInterpretation);
    expect(container.textContent).not.toContain(
      "Le nom 'florian' seul n'apporte pas de sens",
    );
  });

  it('oracle falls back to interpretation when composition is absent', async () => {
    await renderWizard({
      lastResult: {
        ...baseOracleResult,
        composition: null,
      },
    });

    await flushTypewriter();

    expect(container.textContent).toContain(legacyInterpretation);
  });

  it('oracle falls back to quote when composition and interpretation are absent, without requiring hermeneutic or motifs', async () => {
    await renderWizard({
      lastResult: {
        ...baseOracleResult,
        interpretation: '',
        hermeneutic: null,
        composition: {
          prose: '',
        },
      },
    });

    await flushTypewriter();

    expect(container.textContent).toContain(legacyQuote);
  });
});
