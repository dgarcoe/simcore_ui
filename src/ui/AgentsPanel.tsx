import type { Agent, SocietyState } from '../api/types';
import { bus } from '../store/bus';
import { isAlive } from '../store/reduce';
import { ATTRIBUTES, SKILLS, diceText, modifier, signed, xpProgress, type DiceRoll, type RpgSheet } from '../store/rpg';
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
  const rolls = useSim((s) => s.rolls);
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
          {agent.rpg && <Sheet sheet={agent.rpg} rolls={rolls[agent.name] ?? []} />}
          {isAlive(agent) && <Social agent={agent} society={sim?.society} />}
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

const FEELING: Record<string, string> = {
  angry: '😠 furioso',
  afraid: '😨 asustado',
  sad: '😢 apenado',
  desperate: '😩 desesperado',
  happy: '😊 contento',
  relieved: '😌 aliviado',
  frustrated: '😤 frustrado',
  hopeful: '🙂 esperanzado',
  calm: '😐 tranquilo',
};

export function reputationLabel(value: number): string {
  if (value >= 0.5) return 'respetado';
  if (value >= 0.15) return 'bien considerado';
  if (value <= -0.5) return 'temido y odiado';
  if (value <= -0.15) return 'despierta desconfianza';
  return '';
}

/** Group, public reputation, how the agent feels and the favors it owes. */
function Social({ agent, society }: { agent: Agent; society?: SocietyState }) {
  const group = agent.faction ? society?.factions?.[agent.faction] : undefined;
  const fame = reputationLabel(agent.reputation ?? 0);
  const feeling = agent.emotion && agent.emotion !== 'calm' ? FEELING[agent.emotion] ?? agent.emotion : '';
  if (!agent.faction && !fame && !feeling && !agent.owes?.length) return null;
  return (
    <div className="social small">
      {agent.faction && (
        <p>
          <span className="faction-flag" style={{ background: group?.color || 'var(--accent)' }} />
          <strong>{agent.faction}</strong>
          {group?.leader === agent.name ? ' · líder' : group?.leader ? ` · líder: ${group.leader}` : ''}
          {group?.goal && <span className="dim"> · {group.goal}</span>}
          {group?.rivals?.length ? <span className="bad-text"> · rivales: {group.rivals.join(', ')}</span> : null}
        </p>
      )}
      {(fame || feeling) && (
        <p>
          {feeling && <span>{feeling}{agent.emotion_toward ? ` con ${agent.emotion_toward}` : ''}</span>}
          {feeling && fame && ' · '}
          {fame && <span className="dim">En el pueblo: {fame}</span>}
        </p>
      )}
      {agent.owes?.length ? <p className="dim">Debe favores a: {agent.owes.map((o) => `${o.to} (${o.what})`).join(' · ')}</p> : null}
    </div>
  );
}

/** Character sheet: level, experience, the six attributes, skills and the latest rolls. */
function Sheet({ sheet, rolls }: { sheet: RpgSheet; rolls: DiceRoll[] }) {
  return (
    <div className="rpg-sheet small">
      <p className="row">
        <strong>⚔ Nivel {sheet.level}</strong>
        <span className="dim">
          {sheet.xp}
          {sheet.next ? ` / ${sheet.next}` : ''} PX
        </span>
      </p>
      <Meter value={xpProgress(sheet)} color="var(--accent)" />
      <div className="rpg-attrs">
        {ATTRIBUTES.map(([key, short, long]) => {
          const v = sheet.attributes[key] ?? 10;
          return (
            <span key={key} className="rpg-attr" title={long}>
              <b>{short}</b>
              <span>{v}</span>
              <em>{signed(modifier(v))}</em>
            </span>
          );
        })}
      </div>
      {sheet.skills.length > 0 && (
        <p>
          <span className="dim">Competente ({signed(sheet.proficiency)}): </span>
          {sheet.skills.map((k) => SKILLS[k] ?? k).join(', ')}
        </p>
      )}
      {rolls.length > 0 && (
        <ul className="rpg-rolls">
          {rolls
            .slice(-4)
            .reverse()
            .map((r, i) => (
              <li key={i} className={r.critical ? 'crit' : r.success ? 'ok' : 'ko'}>
                <span className="dim">t{r.tick}</span> {diceText(r)}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
