import type { Agent } from '../api/types';
import { bus } from '../store/bus';
import { isAlive } from '../store/reduce';
import { useSim } from '../store/simStore';
import type { ThemePack } from '../themes/types';
import { AgentActions, Conditions, Inventory, Mind, Needs, SpawnForm } from './AgentControls';
import { Portrait } from './Portrait';

function statusLabel(a: Agent): string {
  const status = a.status ?? a.state.status;
  return status === 'dead' ? '✝ muerto' : status === 'departed' ? 'se ha ido' : '';
}

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
  // Right after a (re)launch s.sim is still the previous run: list nobody until the new one arrives.
  const sim = useSim((s) => (s.simFresh ? s.sim : null));
  const selected = useSim((s) => s.selectedAgent);
  const follow = useSim((s) => s.follow);
  const reflections = useSim((s) => s.reflections);
  const lastWhy = useSim((s) => s.reasoning);
  const { selectAgent, set } = useSim.getState();
  const agents = sim ? Object.values(sim.agents).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const agent = agents.find((a) => a.name === selected);

  return (
    <div className="panel-body">
      <SpawnForm />
      <ul className="agent-list">
        {agents.map((a) => (
          <li key={a.id}>
            <button
              className={`agent-row ${a.name === selected ? 'on' : ''} ${isAlive(a) ? '' : 'gone'}`}
              onClick={() => {
                selectAgent(a.name === selected ? null : a.name);
                bus.emit('focusAgent', a.name);
              }}
            >
              <Portrait theme={theme} name={a.name} scale={2} />
              <span className="agent-row-text">
                <strong>{a.name}</strong>
                <span className="dim">
                  {statusLabel(a) ? `${statusLabel(a)} · ` : ''}
                  {isAlive(a) && Object.keys(a.state.conditions ?? {}).length ? `${Object.keys(a.state.conditions ?? {}).join(', ')} · ` : ''}
                  {a.location}
                </span>
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
          {statusLabel(agent) && <p className="bad-text">{statusLabel(agent)}</p>}
          <Conditions agent={agent} />
          {agent.mind && isAlive(agent) && (
            <div className="mind-shift">
              <p>
                <strong>🧠 Mente de {agent.mind.condition}</strong>
                <span className="dim small">
                  {' '}· sigue el LLM{agent.mind.speech ? '' : ' · no habla'}{agent.mind.memories ? '' : ' · no recuerda quién era'}
                </span>
              </p>
              {agent.mind.identity && <p className="small">{agent.mind.identity}</p>}
              {agent.mind.goals.length > 0 && <p className="small dim">Metas: {agent.mind.goals.join(' · ')}</p>}
            </div>
          )}
          {agent.search && isAlive(agent) && (
            <div className="mind-shift">
              <p>
                <strong>🔎 {agent.search.found ? `Ha encontrado a ${agent.search.target}` : `Buscando a ${agent.search.target}`}</strong>
                {agent.search.why && <span className="dim small"> · {agent.search.why}</span>}
              </p>
              {agent.search.clues.length > 0 && (
                <p className="small">
                  Pistas: {agent.search.clues.map((c) => `${c.by === 'you' ? 'lo vio en' : `${c.by}: `} ${c.place}${c.ago > 0 ? ` (hace ${c.ago})` : ''}`).join(' · ')}
                </p>
              )}
              {agent.search.checked.length > 0 && <p className="small dim">Ya miró: {agent.search.checked.join(', ')}</p>}
            </div>
          )}
          <Needs agent={agent} />
          <AgentActions agent={agent} />
          {isAlive(agent) && agent.state.current_action && <p className="action">» {agent.state.current_action}</p>}
          {isAlive(agent) && lastWhy[agent.name]?.text && (
            <p className="why-block">
              <span className="dim">Por qué (t{lastWhy[agent.name].tick}): </span>
              {lastWhy[agent.name].text}
            </p>
          )}
          <dl className="stats">
            {typeof agent.state.health === 'number' && (
              <>
                <dt>Salud</dt>
                <dd><Meter value={agent.state.health} color={agent.state.health > 0.6 ? '#38b764' : agent.state.health > 0.3 ? '#ffcd75' : '#b13e53'} /></dd>
              </>
            )}
            <dt>Ánimo</dt>
            <dd><Meter value={agent.state.mood} min={-1} max={1} color={agent.state.mood >= 0 ? '#38b764' : '#b13e53'} /></dd>
            <dt>Energía</dt>
            <dd><Meter value={agent.state.energy} color="#ffcd75" /></dd>
            {TRAITS.map(([k, label]) => (
              <FragmentRow key={k} label={label} value={agent.personality[k]} />
            ))}
          </dl>
          <Inventory agent={agent} />
          <Mind agent={agent} />
          {Object.keys(agent.relationships ?? {}).length > 0 && (
            <>
              <h4>Relaciones</h4>
              <ul className="kv">
                {Object.entries(agent.relationships).map(([k, v]) => (
                  <li key={k}>
                    <button className="link" onClick={() => selectAgent(k)}>{k}</button>
                    <span className="dim">
                      {agent.relationship_kinds?.[k] ? <strong className="rel-kind">{agent.relationship_kinds[k]} · </strong> : null}
                      {v.replace(/^[^:(]*(: your [^(]*)?\(/, '(')}
                    </span>
                  </li>
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
