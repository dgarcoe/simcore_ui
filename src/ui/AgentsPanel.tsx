import type { Agent } from '../api/types';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';
import type { ThemePack } from '../themes/types';
import { Portrait } from './Portrait';

const TRAITS: Array<[keyof Agent['personality'], string]> = [
  ['openness', 'Apertura'],
  ['conscientiousness', 'Responsabilidad'],
  ['extraversion', 'Extraversión'],
  ['agreeableness', 'Amabilidad'],
  ['neuroticism', 'Neuroticismo'],
];

function Meter({ value, min = 0, max = 1, color }: { value: number; min?: number; max?: number; color: string }) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="meter">
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export function AgentsPanel({ theme }: { theme: ThemePack }) {
  const sim = useSim((s) => s.sim);
  const selected = useSim((s) => s.selectedAgent);
  const follow = useSim((s) => s.follow);
  const reflections = useSim((s) => s.reflections);
  const { selectAgent, set } = useSim.getState();
  const agents = sim ? Object.values(sim.agents).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const agent = agents.find((a) => a.name === selected);

  return (
    <div className="panel-body">
      <ul className="agent-list">
        {agents.map((a) => (
          <li key={a.id}>
            <button
              className={`agent-row ${a.name === selected ? 'on' : ''}`}
              onClick={() => {
                selectAgent(a.name === selected ? null : a.name);
                bus.emit('focusAgent', a.name);
              }}
            >
              <Portrait theme={theme} name={a.name} scale={2} />
              <span className="agent-row-text">
                <strong>{a.name}</strong>
                <span className="dim">{a.location}</span>
              </span>
              <span className="mood-dot" style={{ background: a.state.mood >= 0 ? '#38b764' : '#b13e53', opacity: 0.4 + Math.abs(a.state.mood) }} />
            </button>
          </li>
        ))}
      </ul>

      {agent && (
        <section className="agent-detail">
          <div className="agent-head">
            <Portrait theme={theme} name={agent.name} scale={4} />
            <div>
              <h3>{agent.name}</h3>
              <button className="link" onClick={() => bus.emit('focusZone', agent.location)}>📍 {agent.location}</button>
              <div className="row">
                <button className="btn" onClick={() => bus.emit('focusAgent', agent.name)}>Centrar</button>
                <button className={`btn ${follow ? 'btn-accent' : ''}`} onClick={() => set({ follow: !follow })}>
                  {follow ? 'Siguiendo' : 'Seguir'}
                </button>
              </div>
            </div>
          </div>
          {agent.state.current_action && <p className="action">» {agent.state.current_action}</p>}
          <dl className="stats">
            <dt>Ánimo</dt>
            <dd><Meter value={agent.state.mood} min={-1} max={1} color={agent.state.mood >= 0 ? '#38b764' : '#b13e53'} /></dd>
            <dt>Energía</dt>
            <dd><Meter value={agent.state.energy} color="#ffcd75" /></dd>
            {TRAITS.map(([k, label]) => (
              <FragmentRow key={k} label={label} value={agent.personality[k]} />
            ))}
          </dl>
          {Object.keys(agent.state.resources ?? {}).length > 0 && (
            <>
              <h4>Recursos</h4>
              <ul className="kv">
                {Object.entries(agent.state.resources).map(([k, v]) => (
                  <li key={k}><span>{k}</span><span>{typeof v === 'number' ? v.toLocaleString() : String(v)}</span></li>
                ))}
              </ul>
            </>
          )}
          {Object.keys(agent.relationships ?? {}).length > 0 && (
            <>
              <h4>Relaciones</h4>
              <ul className="kv">
                {Object.entries(agent.relationships).map(([k, v]) => (
                  <li key={k}><button className="link" onClick={() => selectAgent(k)}>{k}</button><span className="dim">{v}</span></li>
                ))}
              </ul>
            </>
          )}
          {(reflections[agent.name] ?? []).length > 0 && (
            <>
              <h4>Reflexiones</h4>
              {(reflections[agent.name] ?? []).slice(-3).reverse().map((r, i) => (
                <p key={i} className="reflection">☁ t{r.tick}: {r.text}</p>
              ))}
            </>
          )}
          <details>
            <summary>Memoria</summary>
            <pre className="memory">{agent.memory_summary}</pre>
          </details>
        </section>
      )}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd><Meter value={value} color="#41a6f6" /></dd>
    </>
  );
}
