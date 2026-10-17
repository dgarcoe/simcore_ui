import { useState } from 'react';
import type { Agent } from '../api/types';
import { mapLocations } from '../game/map/model';
import { hasLifecycle, isAlive } from '../store/reduce';
import { useSim } from '../store/simStore';
import { applyEffects } from '../store/sources';

/** Live-only interventions on one agent: hurt, heal, kill, send away. */
export function AgentActions({ agent }: { agent: Agent }) {
  const live = useSim((s) => s.mode === 'live' && s.status === 'running');
  const supported = useSim((s) => hasLifecycle(s.sim));
  const [error, setError] = useState('');
  if (!live || !supported || !isAlive(agent)) return null;
  const act = (description: string, effects: Record<string, unknown>) =>
    applyEffects(description, effects).then(
      () => setError(''),
      (e: Error) => setError(e.message),
    );
  const n = agent.name;
  return (
    <div className="agent-actions">
      <span className="dim small">Intervenir:</span>
      <button className="btn" onClick={() => act(`${n} resulta herido`, { health: { [n]: -0.3 } })}>Herir</button>
      <button className="btn" onClick={() => act(`${n} recibe atención médica`, { health: { [n]: 0.3 } })}>Curar</button>
      <button className="btn" onClick={() => confirm(`¿Matar a ${n}?`) && act(`${n} muere`, { kill: n })}>Matar</button>
      <button className="btn" onClick={() => act(`${n} abandona el lugar`, { depart: n })}>Retirar</button>
      {error && <span className="bad-text small">{error}</span>}
    </div>
  );
}

/** Live-only: bring a new agent into the running simulation. */
export function SpawnForm() {
  const sim = useSim((s) => s.sim);
  const live = useSim((s) => s.mode === 'live' && s.status === 'running');
  const [name, setName] = useState('');
  const [profession, setProfession] = useState('');
  const [where, setWhere] = useState('');
  const [error, setError] = useState('');
  if (!live || !hasLifecycle(sim)) return null;
  const places = mapLocations(sim!.environment).map((l) => l.name);
  return (
    <details className="spawn">
      <summary>✚ Hacer llegar a alguien</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const location = where || places[0] || '';
          applyEffects(`${name.trim()} llega${location ? ` a ${location}` : ''}`, {
            spawn: [{ name: name.trim(), profession: profession.trim() || 'citizen', starting_location: location }],
          }).then(
            () => {
              setName('');
              setProfession('');
              setError('');
            },
            (err: Error) => setError(err.message),
          );
        }}
      >
        <input className="input" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Profesión (médica, soldado…)" value={profession} onChange={(e) => setProfession(e.target.value)} />
        <div className="row">
          <select className="select" value={where} onChange={(e) => setWhere(e.target.value)}>
            {places.map((p) => <option key={p}>{p}</option>)}
          </select>
          <button className="btn btn-accent" type="submit">Llega</button>
        </div>
        {error && <span className="bad-text small">{error}</span>}
      </form>
    </details>
  );
}
