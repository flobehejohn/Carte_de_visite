/**
 * PHASE 4 - THE SYNAPTIC BRIDGE
 * Permet au DOM (React) et au Canvas (WebGL) de synchroniser leurs états de focus (survol/clic)
 * sans couplage direct.
 */

export type FocusTarget = 'none' | 'chapter' | 'quote' | 'keyword' | 'citation';

export interface FocusEventDetail {
  target: FocusTarget;
  id?: string; // Ex: l'identifiant du mot-clé survolé
  source: 'html' | 'webgl';
}

class InteractionBridge {
  private target: EventTarget;

  constructor() {
    // Utilisation d'un DocumentFragment comme bus d'événements léger en mémoire
    this.target =
      typeof document !== 'undefined'
        ? document.createDocumentFragment()
        : new EventTarget();
  }

  setFocus(detail: FocusEventDetail) {
    this.target.dispatchEvent(new CustomEvent('oracle-focus', { detail }));
  }

  clearFocus(source: 'html' | 'webgl') {
    this.target.dispatchEvent(
      new CustomEvent('oracle-focus', {
        detail: { target: 'none', source },
      }),
    );
  }

  subscribe(callback: (detail: FocusEventDetail) => void) {
    const handler = (e: Event) => callback((e as CustomEvent).detail);
    this.target.addEventListener('oracle-focus', handler);
    return () => this.target.removeEventListener('oracle-focus', handler);
  }
}

export const oracleInteractionBridge = new InteractionBridge();
