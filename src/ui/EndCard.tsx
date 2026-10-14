import { useState } from 'react';
import * as api from '../api/client';
import { useSim } from '../store/simStore';

/** Shown when a run finishes; live runs can ask Simcore for an LLM-written chronicle. */
export function EndCard() {
  const status = useSim((s) => s.status);
  const mode = useSim((s) => s.mode);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status !== 'ended' || !open) return null;

  const chronicle = async () => {
    setLoading(true);
    try {
      setText(await api.postmortem());
    } catch (e) {
      setText(`No se pudo generar la crónica: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="endcard">
      <button className="close" onClick={() => setOpen(false)} aria-label="Cerrar">×</button>
      <h2>Fin de la simulación</h2>
      {mode === 'live' && !text && (
        <button className="btn btn-accent" disabled={loading} onClick={chronicle}>
          {loading ? 'Escribiendo…' : 'Generar crónica'}
        </button>
      )}
      {text && <div className="chronicle">{text}</div>}
    </div>
  );
}
