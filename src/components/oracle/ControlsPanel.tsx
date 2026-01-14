interface ControlsPanelProps {
  debug: boolean;
  onToggleDebug: (value: boolean) => void;
  loading?: boolean;
  lastRequestId?: string;
}

function ControlsPanel({ debug, onToggleDebug, loading, lastRequestId }: ControlsPanelProps) {
  return (
    <div className="controls-panel">
      <h2>Réglages</h2>
      <div className="debug-toggle">
        <input
          id="debugMode"
          type="checkbox"
          checked={debug}
          onChange={(e) => onToggleDebug(e.target.checked)}
          disabled={loading}
        />
        <label htmlFor="debugMode">Mode debug</label>
      </div>
      {lastRequestId && <div style={{ marginTop: 8 }}>Dernière requête : {lastRequestId}</div>}
    </div>
  );
}

export default ControlsPanel;
