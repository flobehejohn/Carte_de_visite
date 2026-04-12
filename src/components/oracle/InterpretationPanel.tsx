import { OracleResult } from '../../domain/types';
import { getOraclePrimaryProse } from '../../services/zarathustraService';

interface InterpretationPanelProps {
  loading?: boolean;
  result: OracleResult | null;
}

function InterpretationPanel({ loading, result }: InterpretationPanelProps) {
  if (loading) {
    return <div className="card">Preparation de l'interpretation...</div>;
  }

  if (!result) {
    return <div className="card">L'interprétation apparaîtra ici après le tirage.</div>;
  }

  const { ritual, keywords } = result;
  const themeLabel = keywords.length > 0 ? keywords.join(' · ') : 'Lecture de Zarathoustra';
  const prose = getOraclePrimaryProse(result);

  return (
    <div className="card">
      <div className="theme-label">{themeLabel}</div>
      <div className="meta" style={{ marginTop: 6 }}>
        <div>Nom / surnom : {ritual.nameOrNickname}</div>
        <div>Humeur : {ritual.mood}</div>
        <div>Format du tirage : {ritual.format}</div>
        {ritual.questionText && <div>Question : « {ritual.questionText} »</div>}
      </div>
      <div className="interpretation">{prose}</div>
    </div>
  );
}

export default InterpretationPanel;
