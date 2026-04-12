import { useMemo, useRef, useState } from 'react';
import { geminiGenerate } from '../lib/geminiClient';

export function GeminiDemo() {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState<string>('');
  const [err, setErr] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const canSend = useMemo(
    () => prompt.trim().length > 0 && !loading,
    [prompt, loading],
  );

  async function onSend() {
    setErr('');
    setAnswer('');
    setLoading(true);

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const r = await geminiGenerate(prompt, {
        signal: abortRef.current.signal,
        model: 'gemini-1.5-flash',
        temperature: 0.6,
        maxOutputTokens: 600,
      });
      setAnswer(r.text);
    } catch (e: any) {
      setErr(e?.message ?? 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  }

  function onCancel() {
    abortRef.current?.abort();
  }

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
      <h2>Gemini (via /api/gemini)</h2>

      <textarea
        rows={5}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Écris ta question..."
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSend} disabled={!canSend}>
          {loading ? 'Envoi…' : 'Envoyer'}
        </button>
        <button onClick={onCancel} disabled={!loading}>
          Annuler
        </button>
      </div>

      {err && <div style={{ color: 'crimson' }}>Erreur: {err}</div>}
      {answer && (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            padding: 12,
            border: '1px solid #ddd',
          }}
        >
          {answer}
        </pre>
      )}
    </div>
  );
}
