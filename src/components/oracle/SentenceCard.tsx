import { OracleResult } from '../../domain/types';

interface SentenceCardProps {
  loading?: boolean;
  result: OracleResult | null;
}

function SentenceCard({ loading, result }: SentenceCardProps) {
  if (loading) {
    return <div className="card">Invocation de l'oracle...</div>;
  }

  if (!result) {
    return (
      <div className="card">
        Aucune phrase encore tirée. Remplis le rituel et lance le tirage pour consulter l'oracle.
      </div>
    );
  }

  const { quote, keywords } = result;
  return (
    <div className="card">
      {keywords.length > 0 && (
        <div className="badge">
          <span>{keywords.join(' • ')}</span>
        </div>
      )}
      <p style={{ fontSize: '1.05rem', marginTop: 0 }}>{quote}</p>
    </div>
  );
}

export default SentenceCard;
