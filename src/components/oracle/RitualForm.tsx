import { FormEvent, useMemo, useState } from 'react';
import { useOracleContext } from '../../context/OracleContext';
import { Humeur, RitualInput, TirageFormat } from '../../domain/types';

const HUMEUR_OPTIONS: Humeur[] = ['calme', 'anxieux', 'joyeux', 'fatigué', 'curieux', 'perdu'];
const FORMAT_OPTIONS: TirageFormat[] = ['Conseil', 'Miroir', 'Question'];

function RitualForm() {
  const { drawFromRitual, loading } = useOracleContext();
  const [nameOrNickname, setNameOrNickname] = useState('');
  const [mood, setMood] = useState<Humeur>('curieux');
  const [format, setFormat] = useState<TirageFormat>('Conseil');
  const [questionText, setQuestionText] = useState('');

  const ritual: RitualInput = useMemo(
    () => ({
      nameOrNickname: nameOrNickname.trim() || 'ami·e',
      mood,
      format,
      questionText: questionText.trim(),

      // Defaults (facultatifs mais pratiques pour éviter du "undefined" côté service/prompt)
      weight: '',
      fear: '',
      desire: '',
      sacrifice: '',
      social: '',
      eternity: '',
    }),
    [nameOrNickname, mood, format, questionText]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    drawFromRitual(ritual);
  };

  return (
    <div className="card">
      <h2>Rituel de tirage</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Nom ou surnom
            <input
              type="text"
              value={nameOrNickname}
              onChange={(e) => setNameOrNickname(e.target.value)}
              placeholder="Ta façon de te nommer aujourd'hui"
              disabled={loading}
            />
          </label>

          <label>
            Humeur
            <select value={mood} onChange={(e) => setMood(e.target.value as Humeur)} disabled={loading}>
              {HUMEUR_OPTIONS.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {String(option)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Format du tirage
            <select value={format} onChange={(e) => setFormat(e.target.value as TirageFormat)} disabled={loading}>
              {FORMAT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ta question
            <textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Ce qui t'occupe en ce moment"
              rows={4}
              disabled={loading}
            />
          </label>

          <button type="submit" disabled={loading}>
            Lancer le tirage
          </button>
        </div>
      </form>
    </div>
  );
}

export default RitualForm;
