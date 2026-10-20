import { useState } from 'react';
import type { EventType } from '../api/types';
import { mapLocations } from '../game/map/model';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';
import { inject } from '../store/sources';
import { WorldControls } from './AgentControls';

const ICON: Partial<Record<EventType, string>> = {
  agent_move: '➜',
  agent_speak: '💬',
  agent_action: '•',
  agent_post: '📣',
  interaction: '⇄',
  scheduled_event: '⚑',
  injected_event: '⚡',
  reflection: '☁',
  simulation_start: '▶',
  simulation_end: '■',
  agent_spawn: '✚',
  agent_death: '✝',
  agent_depart: '⇥',
  environment_change: '🌐',
  item_transfer: '▣',
  trade_result: '⇄',
  condition_change: '◈',
  need_change: '♨',
  place_change: '⌂',
  rule_fired: '⚙',
  agent_plan: '☰',
  belief_shared: '❝',
  speech_ignored: '🙉',
  agent_search: '🔎',
  faction_change: '⚑',
  vote_called: '🗳',
  vote_result: '🗳',
  dice_roll: '🎲',
  level_up: '⭐',
};

const ITEM_ACTIONS = new Set(['give', 'take', 'drop', 'use', 'offer', 'accept', 'decline']);

const FILTERS: Array<[string, EventType[] | 'items' | null]> = [
  ['Todo', null],
  ['Diálogo', ['agent_speak', 'interaction', 'agent_post', 'belief_shared', 'speech_ignored', 'agent_search']],
  ['Sociedad', ['faction_change', 'vote_called', 'vote_result']],
  ['Tiradas', ['dice_roll', 'level_up']],
  ['Movimiento', ['agent_move']],
  ['Mundo', ['scheduled_event', 'injected_event', 'environment_change', 'agent_spawn', 'agent_death', 'agent_depart', 'condition_change', 'place_change', 'rule_fired', 'simulation_start', 'simulation_end']],
  ['Reflexión', ['reflection', 'agent_plan']],
  ['Objetos', 'items'],
];

export function EventsPanel() {
  const feed = useSim((s) => s.feed);
  const sim = useSim((s) => s.sim);
  const selectAgent = useSim((s) => s.selectAgent);
  const [filter, setFilter] = useState(0);
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const types = FILTERS[filter][1];
  const items = feed
    .filter((f) =>
      !types
        ? true
        : types === 'items'
          ? f.type === 'item_transfer' || f.type === 'trade_result' || (!!f.action && ITEM_ACTIONS.has(f.action.kind))
          : types.includes(f.type),
    )
    .slice(-200)
    .reverse();

  return (
    <div className="panel-body">
      <form
        className="inject"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          void inject(text.trim(), location);
          setText('');
        }}
      >
        <input className="input" placeholder="Inyectar suceso: «Se declara un incendio…»" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <select className="select" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">Todo el mundo</option>
            {sim && mapLocations(sim.environment).map((l) => <option key={l.name}>{l.name}</option>)}
          </select>
          <button className="btn btn-accent" type="submit">Inyectar</button>
        </div>
      </form>
      <WorldControls />
      <div className="filters">
        {FILTERS.map(([label], i) => (
          <button key={label} className={`chip-btn ${i === filter ? 'on' : ''}`} onClick={() => setFilter(i)}>{label}</button>
        ))}
      </div>
      {items.length === 0 && <p className="empty">Sin sucesos todavía.</p>}
      <ul className="feed">
        {items.map((f) => (
          <li key={f.id} className={`feed-item t-${f.type}`}>
            <span className="tick">t{f.tick}</span>
            <span className="icon">{ICON[f.type] ?? '·'}</span>
            <span>
              {f.source && (
                <button className="link" onClick={() => { selectAgent(f.source); bus.emit('focusAgent', f.source); }}>
                  {f.source}
                </button>
              )}{' '}
              {f.text}
              {f.reasoning && <span className={`why ${/^(LLM error|LLM failed|Parse error)/.test(f.reasoning) ? 'why-bad' : ''}`}>{shortWhy(f.reasoning)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function shortWhy(text: string): string {
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}
