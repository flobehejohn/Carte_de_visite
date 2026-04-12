/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { oracleInteractionBridge } from './InteractionBridge';

describe('InteractionBridge P0', () => {
  it('émet et route correctement les événements de focus sémantique (abstraction HTML/WebGL)', () => {
    const listener = vi.fn();
    const unsubscribe = oracleInteractionBridge.subscribe(listener);

    oracleInteractionBridge.setFocus({ target: 'citation', source: 'html' });
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'citation', source: 'html' }),
    );

    oracleInteractionBridge.clearFocus('html');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'none', source: 'html' }),
    );

    unsubscribe();
  });
});
