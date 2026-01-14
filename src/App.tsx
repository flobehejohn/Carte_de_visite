import OracleLayout from './components/layout/OracleLayout';
import { OracleProvider } from './context/OracleContext';

function App() {
  return (
    <OracleProvider>
      <OracleLayout />
    </OracleProvider>
  );
}

export default App;
