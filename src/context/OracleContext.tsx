import { createContext, PropsWithChildren, useContext } from 'react';
import { useOracle } from '../hooks/useOracle';

type OracleContextValue = ReturnType<typeof useOracle>;

const OracleContext = createContext<OracleContextValue | undefined>(undefined);

export function OracleProvider({ children }: PropsWithChildren<{}>) {
  const value = useOracle();
  return <OracleContext.Provider value={value}>{children}</OracleContext.Provider>;
}

export function useOracleContext(): OracleContextValue {
  const ctx = useContext(OracleContext);
  if (!ctx) {
    throw new Error('useOracleContext doit être utilisé à l’intérieur de <OracleProvider>');
  }
  return ctx;
}
