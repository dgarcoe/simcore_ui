import { useState } from 'react';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';
import type { ThemePack } from '../themes/types';
import { Portrait } from './Portrait';

const KIND_ICON = { speak: '', trade: '⇄ ', interact: '✋ ' } as const;

export function ChatPanel({ theme }: { theme: ThemePack }) {
  const conversations = useSim((s) => s.conversations);
  const selected = useSim((s) => s.selectedAgent);
  const selectAgent = useSim((s) => s.selectAgent);
  const [onlySelected, setOnlySelected] = useState(false);

  const list = [...conversations]
    .reverse()
    .filter((c) => !onlySelected || !selected || c.participants.includes(selected));

  return (
    <div className="panel-body">
      <label className="toggle">
        <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
        Solo {selected ? selected : 'el agente seleccionado'}
      </label>
      {list.length === 0 && <p className="empty">Aún no hay conversaciones.</p>}
      {list.map((c) => (
        <article key={c.id} className="conv">
          <header className="conv-head" onClick={() => c.location && bus.emit('focusZone', c.location)}>
            <span>{c.participants.join(' ↔ ')}</span>
            <span className="dim">
              {c.location && `${c.location} · `}t{c.startTick}
              {c.lastTick !== c.startTick && `–${c.lastTick}`}
            </span>
          </header>
          {c.lines.map((l, i) => (
            <div key={i} className={`line line-${l.kind}`}>
              <button className="who" onClick={() => { selectAgent(l.speaker); bus.emit('focusAgent', l.speaker); }}>
                <Portrait theme={theme} name={l.speaker} scale={1} />
                {l.speaker}
              </button>
              <span className="what">
                {KIND_ICON[l.kind]}
                {l.kind === 'speak' ? `“${l.text}”` : l.text}
              </span>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
