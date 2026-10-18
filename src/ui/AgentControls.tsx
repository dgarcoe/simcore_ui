import { useState } from 'react';
import type { Agent, ItemInfo } from '../api/types';
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

function fmt(n: unknown): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** "botiquín · al usar: salud +0.4" */
export function itemHint(info: ItemInfo | undefined): string {
  if (!info) return '';
  const names = { health: 'salud', energy: 'energía', mood: 'ánimo' } as const;
  const use = Object.entries(info.on_use ?? {})
    .map(([k, v]) => `${names[k as keyof typeof names] ?? k} ${Number(v) >= 0 ? '+' : ''}${v}`)
    .join(', ');
  return [info.description, use && `al usar: ${use}${info.consumable === false ? ' (no se gasta)' : ''}`].filter(Boolean).join(' · ');
}

/** What the agent carries, what lies where it is, its pending offers, and (live) a way to hand it items. */
export function Inventory({ agent }: { agent: Agent }) {
  const sim = useSim((s) => s.sim);
  const live = useSim((s) => s.mode === 'live' && s.status === 'running');
  const [item, setItem] = useState('');
  const [amount, setAmount] = useState(1);
  const [error, setError] = useState('');
  const catalog = sim?.items ?? {};
  const held = Object.entries(agent.state.resources ?? {}).filter(([, v]) => typeof v !== 'number' || v > 0);
  const here = Object.entries(sim?.environment.locations[agent.location]?.stock ?? {}).filter(([, v]) => v > 0);
  const offers = (sim?.offers ?? []).filter((o) => o.from === agent.name || o.to === agent.name);
  const canGive = live && hasLifecycle(sim) && isAlive(agent);
  const known = [...new Set([...Object.keys(catalog), ...held.map(([k]) => k)])].sort();
  return (
    <>
      <h4>Inventario</h4>
      {held.length === 0 ? (
        <p className="dim small">Nada.</p>
      ) : (
        <ul className="kv">
          {held.map(([k, v]) => (
            <li key={k} title={itemHint(catalog[k])}>
              <span>{k}{catalog[k]?.description ? <span className="dim"> · {catalog[k].description}</span> : null}</span>
              <span>{typeof v === 'number' ? fmt(v) : String(v)}</span>
            </li>
          ))}
        </ul>
      )}
      {here.length > 0 && isAlive(agent) && (
        <p className="dim small">En {agent.location}: {here.map(([k, v]) => `${k} ×${fmt(v)}`).join(', ')}</p>
      )}
      {offers.length > 0 && (
        <ul className="offers">
          {offers.map((o, i) => (
            <li key={i} className="small">
              ⇄ {o.from === agent.name ? `Ofrece a ${o.to}` : `${o.from} le ofrece`} {fmt(o.amount)} {o.item}
              {o.ask_item ? ` por ${fmt(o.ask_amount)} ${o.ask_item}` : ' (regalo)'} <span className="dim">· hasta t{o.expires}</span>
            </li>
          ))}
        </ul>
      )}
      {canGive && (
        <form
          className="row wrap give-item"
          onSubmit={(e) => {
            e.preventDefault();
            const name = item.trim();
            if (!name || !amount) return;
            applyEffects(`${agent.name} ${amount > 0 ? 'recibe' : 'pierde'} ${Math.abs(amount)} ${name}`, { items: { [agent.name]: { [name]: amount } } }).then(
              () => setError(''),
              (err: Error) => setError(err.message),
            );
          }}
        >
          <input className="input" list="known-items" placeholder="objeto" value={item} onChange={(e) => setItem(e.target.value)} />
          <datalist id="known-items">{known.map((k) => <option key={k} value={k} />)}</datalist>
          <input className="input tiny" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} title="Negativo para quitar" />
          <button className="btn" type="submit">{amount < 0 ? 'Quitar' : 'Dar'}</button>
          {error && <span className="bad-text small">{error}</span>}
        </form>
      )}
    </>
  );
}

/** Conditions the agent is in (with color and time left) and, live, a way to add or remove them. */
export function Conditions({ agent }: { agent: Agent }) {
  const sim = useSim((s) => s.sim);
  const live = useSim((s) => s.mode === 'live' && s.status === 'running');
  const [pick, setPick] = useState('');
  const [error, setError] = useState('');
  const catalog = sim?.conditions ?? {};
  const held = Object.entries(agent.state.conditions ?? {});
  const canEdit = live && isAlive(agent) && Object.keys(catalog).length > 0;
  if ((!held.length && !canEdit) || !isAlive(agent)) return null;
  const change = (key: 'add_condition' | 'remove_condition', name: string) =>
    applyEffects(`${agent.name} ${key === 'add_condition' ? 'pasa a estar' : 'deja de estar'}: ${name}`, { [key]: { [agent.name]: name } }).then(
      () => setError(''),
      (err: Error) => setError(err.message),
    );
  return (
    <div className="conditions">
      {held.map(([name, left]) => {
        const info = catalog[name];
        return (
          <span
            key={name}
            className="cond-chip"
            style={{ borderColor: info?.color || undefined, color: info?.color || undefined }}
            title={[info?.description, info?.controller === 'rules' ? 'Lo controlan reglas, no el LLM' : '', left != null && info?.becomes ? `En ${left} ticks: ${info.becomes}` : left != null ? `${left} ticks más` : '']
              .filter(Boolean)
              .join(' · ')}
          >
            {name}
            {left != null ? ` · ${left}` : ''}
            {canEdit && (
              <button className="link" onClick={() => change('remove_condition', name)} aria-label={`Quitar ${name}`}>
                ✕
              </button>
            )}
          </span>
        );
      })}
      {canEdit && (
        <select className="select" value={pick} onChange={(e) => (setPick(''), e.target.value && change('add_condition', e.target.value))}>
          <option value="">+ estado…</option>
          {Object.keys(catalog)
            .filter((n) => !(n in (agent.state.conditions ?? {})))
            .map((n) => <option key={n}>{n}</option>)}
        </select>
      )}
      {error && <span className="bad-text small">{error}</span>}
    </div>
  );
}

/** Scenario needs (hunger, sleep…) as bars; red once critical. */
export function Needs({ agent }: { agent: Agent }) {
  const catalog = useSim((s) => s.sim?.needs);
  const needs = Object.entries(agent.state.needs ?? {});
  if (!needs.length || !isAlive(agent)) return null;
  return (
    <dl className="stats needs">
      {needs.map(([name, v]) => (
        <span key={name} style={{ display: 'contents' }}>
          <dt>{catalog?.[name]?.label || name}</dt>
          <dd title={`${Math.round(v * 100)}%`}>
            <div className="meter">
              <div style={{ width: `${Math.round(v * 100)}%`, background: v >= 1 ? '#b13e53' : v >= 0.5 ? '#ef7d57' : '#94b0c2' }} />
            </div>
          </dd>
        </span>
      ))}
    </dl>
  );
}

/** Live: close/open places, light/put out a hazard, nudge a world variable. */
export function WorldControls() {
  const sim = useSim((s) => s.sim);
  const live = useSim((s) => s.mode === 'live' && s.status === 'running');
  const [place, setPlace] = useState('');
  const [hazard, setHazard] = useState('en llamas');
  const [variable, setVariable] = useState('');
  const [delta, setDelta] = useState(-0.1);
  const [error, setError] = useState('');
  if (!live || !hasLifecycle(sim)) return null;
  const places = mapLocations(sim!.environment).map((l) => l.name);
  const where = place || places[0] || '';
  const loc = sim!.environment.locations[where];
  const numeric = Object.entries(sim!.environment.global_state ?? {}).filter(([k, v]) => typeof v === 'number' && !k.startsWith('ui_'));
  const run = (description: string, effects: Record<string, unknown>) =>
    applyEffects(description, effects).then(
      () => setError(''),
      (err: Error) => setError(err.message),
    );
  return (
    <details className="world-controls">
      <summary>⌂ Mundo</summary>
      <div className="row wrap">
        <select className="select" value={where} onChange={(e) => setPlace(e.target.value)}>
          {places.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn" onClick={() => run(`${where} ${loc?.closed ? 'se abre' : 'se cierra'}`, { locations: { [where]: { closed: !loc?.closed } } })}>
          {loc?.closed ? 'Abrir' : 'Cerrar'}
        </button>
        {loc?.hazard ? (
          <button className="btn" onClick={() => run(`${where} ya no es peligroso`, { locations: { [where]: { hazard: null } } })}>Quitar peligro</button>
        ) : (
          <>
            <input className="input" value={hazard} onChange={(e) => setHazard(e.target.value)} placeholder="en llamas, inundado…" />
            <button
              className="btn"
              onClick={() => run(`${where}: ${hazard}`, { locations: { [where]: { hazard: { label: hazard, per_tick: { health: -0.1 } } } } })}
            >
              Peligro
            </button>
          </>
        )}
      </div>
      {numeric.length > 0 && (
        <div className="row wrap">
          <select className="select" value={variable || numeric[0][0]} onChange={(e) => setVariable(e.target.value)}>
            {numeric.map(([k, v]) => <option key={k} value={k}>{k} = {String(v)}</option>)}
          </select>
          <input className="input tiny" type="number" step={0.05} value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          <button className="btn" onClick={() => run('', { adjust: { [variable || numeric[0][0]]: delta } })}>Ajustar</button>
        </div>
      )}
      {error && <span className="bad-text small">{error}</span>}
    </details>
  );
}
