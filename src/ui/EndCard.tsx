import { useState } from 'react';
import * as api from '../api/client';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';

/** Shown when a run finishes; live runs can ask Simcore for an LLM-written chronicle. */
export function EndCard() {
  const status = useSim((s) => s.status);
  const mode = useSim((s) => s.mode);
  const reason = useSim((s) => s.endReason);
  const message = useSim((s) => s.endMessage);
  const sim = useSim((s) => s.sim);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (status !== 'ended' || !open) return null;
  const fallen = sim ? Object.values(sim.agents).filter((a) => (a.status ?? a.state.status) === 'dead').map((a) => a.name) : [];

  const chronicle = async () => {
    setLoading(true);
    try {
      const narrative = await api.postmortem();
      setText(narrative);
      useSim.getState().set({ epilogue: narrative });
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
      {reason === 'no_agents_left' && <p>No queda nadie con vida en el escenario.</p>}
      {message && <p className="end-message">{message}</p>}
      {fallen.length > 0 && <p className="dim">✝ {fallen.join(', ')}</p>}
      {mode === 'live' && !text && (
        <button className="btn btn-accent" disabled={loading} onClick={chronicle}>
          {loading ? 'Escribiendo…' : 'Generar crónica'}
        </button>
      )}
      {text && <div className="chronicle">{text}</div>}
      <button className="btn" onClick={() => bus.emit('openTab', 'story')}>📖 Ver la historia</button>
    </div>
  );
}
