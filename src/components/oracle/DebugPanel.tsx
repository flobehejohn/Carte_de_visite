import { OracleResult } from '../../domain/types';

interface DebugPanelProps {
  result: OracleResult | null;
  lastRequestId?: string;
}

function DebugPanel({ result, lastRequestId }: DebugPanelProps) {
  if (!result) {
    return <div className="debug-panel">Débug : aucun tirage encore disponible.</div>;
  }

  return (
    <div className="debug-panel">
      <h3>Debug</h3>
      {lastRequestId && <div>Requête : {lastRequestId}</div>}
      <div>Rituel : {result.ritual.nameOrNickname} / {result.ritual.mood} / {result.ritual.format}</div>
      <div style={{ marginTop: 8 }}>
        <strong>Mots-clés</strong>
        <ul>
          {result.keywords.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Payload</strong>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>
  );
}

export default DebugPanel;
