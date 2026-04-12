export type OracleInteractionSource = 'html' | 'webgl' | 'system';

export type OracleInteractionTarget =
  | 'none'
  | 'citation'
  | 'sources'
  | 'quote'
  | 'interpretation'
  | 'prose'
  | 'chapter';

export interface OracleInteractionEvent {
  target: OracleInteractionTarget;
  source: OracleInteractionSource;
  at: number;
  payload?: Record<string, unknown>;
}

export type OracleInteractionListener = (event: OracleInteractionEvent) => void;

class OracleInteractionBridge {
  private listeners = new Set<OracleInteractionListener>();

  private current: OracleInteractionEvent = {
    target: 'none',
    source: 'system',
    at: Date.now(),
  };

  subscribe(listener: OracleInteractionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setFocus(
    input: Omit<OracleInteractionEvent, 'at'> &
      Partial<Pick<OracleInteractionEvent, 'at'>>,
  ): void {
    this.current = {
      target: input.target,
      source: input.source,
      payload: input.payload,
      at: input.at ?? Date.now(),
    };
    this.emit();
  }

  clearFocus(source: OracleInteractionSource = 'system'): void {
    this.current = {
      target: 'none',
      source,
      at: Date.now(),
    };
    this.emit();
  }

  getSnapshot(): OracleInteractionEvent {
    return { ...this.current };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();

    if (typeof window !== 'undefined') {
      (window as any).__ORACLE_LAST_FOCUS__ = snapshot;
      (window as any).__ORACLE_INTERACTION_BRIDGE__ = this;
    }

    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const oracleInteractionBridge = new OracleInteractionBridge();

if (typeof window !== 'undefined') {
  (window as any).__ORACLE_INTERACTION_BRIDGE__ = oracleInteractionBridge;
}
