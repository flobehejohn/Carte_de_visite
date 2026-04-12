import { useEffect, useState } from 'react';
import OracleLayout from './components/layout/OracleLayout';
import RitualWizard from './components/oracle/RitualWizard';
import { OracleProvider } from './context/OracleContext';

function App() {
  const [isPhase8E2E, setIsPhase8E2E] = useState(false);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.location.href.includes('e2e=phase8')
    ) {
      setIsPhase8E2E(true);
    }
  }, []);

  return (
    <OracleProvider>
      {isPhase8E2E ? <RitualWizard isE2E={true} /> : <OracleLayout />}
    </OracleProvider>
  );
}

export default App;
