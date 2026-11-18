import { useMemo } from 'react';
import { itemTrail } from '../store/review';
import { useSim } from '../store/simStore';
import { seekReplay } from '../store/sources';

/** Replays: the item being followed, step by step (future steps dimmed); click to go there. */
export function ItemTrailCard() {
  const item = useSim((s) => s.layers.item);
  const events = useSim((s) => s.replayEvents);
  const tick = useSim((s) => s.sim?.clock.tick ?? 0);
  const set = useSim((s) => s.set);
  const layers = useSim((s) => s.layers);
  const steps = useMemo(() => (item && events ? itemTrail(events, item).steps : []), [item, events]);
  if (!item) return null;
  return (
    <aside className="item-trail" aria-label={`Rastro de ${item}`}>
      <div className="row between">
        <strong>🔍 {item.replace(/_/g, ' ')}</strong>
        <button className="btn" aria-label="Dejar de rastrear" onClick={() => set({ layers: { ...layers, item: null } })}>✕</button>
      </div>
      {steps.length === 0 && <p className="dim small">No ha cambiado de manos.</p>}
      <ol>
        {steps.map((s, i) => (
          <li key={i} className={s.tick > tick ? 'future' : ''}>
            <button className="link" onClick={() => seekReplay(s.tick)}>t{s.tick}</button> {s.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
