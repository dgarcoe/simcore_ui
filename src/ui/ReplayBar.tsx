import { useState } from 'react';
import { useSim } from '../store/simStore';
import { control, jumpMoment, seekReplay, stepReplay } from '../store/sources';
import type { Moment } from '../store/story';

/** Colour of a key moment's mark on the timeline. */
export function momentColor(m: Moment): string {
  if (m.kind === 'agent_death') return '#b13e53';
  if (m.kind === 'condition_change') return '#7bc950';
  if (m.kind === 'item_transfer') return '#ffcd75';
  if (m.kind === 'vote_result' || m.kind === 'faction_change') return '#41a6f6';
  if (m.kind === 'level_up' || m.kind === 'dice_roll') return '#ef7d57';
  if (m.kind === 'simulation_end' || m.kind === 'rule_fired') return '#f4f4f4';
  return '#94b0c2';
}

/** Replay timeline: scrub to any tick, see where the key moments are, step tick by tick. */
export function ReplayBar() {
  const timeline = useSim((s) => s.replayTimeline);
  const tick = useSim((s) => s.sim?.clock.tick ?? 0);
  const paused = useSim((s) => s.paused);
  const ended = useSim((s) => s.status === 'ended');
  const [hover, setHover] = useState<{ tick: number; text: string } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  if (!timeline || timeline.ticks <= 0) return null;
  const max = timeline.ticks;
  const pct = (t: number) => `${(Math.min(max, Math.max(0, t)) / max) * 100}%`;
  // Several moments in the same tick share a mark: show the most important first.
  const byTick = new Map<number, Moment[]>();
  for (const m of timeline.moments) byTick.set(m.tick, [...(byTick.get(m.tick) ?? []), m]);
  const marks = [...byTick.entries()].map(([t, ms]) => [t, ms.sort((a, b) => b.importance - a.importance)] as const);
  const shown = drag ?? tick;
  const label = hover ?? { tick: shown, text: '' };

  return (
    <div className="replaybar" role="group" aria-label="Reproductor">
      <div className="replay-buttons">
        <button className="btn" title="Al principio" onClick={() => seekReplay(0)}>⏮</button>
        <button className="btn" title="Momento clave anterior" onClick={() => jumpMoment(-1)}>⇤</button>
        <button className="btn" title="Tick anterior" onClick={() => stepReplay(-1)}>◀</button>
        {ended ? (
          <button className="btn" title="Volver a ver" onClick={() => { seekReplay(0); control('resume'); }}>↺</button>
        ) : paused ? (
          <button className="btn btn-accent" title="Reproducir" onClick={() => control('resume')}>▶</button>
        ) : (
          <button className="btn" title="Pausar" onClick={() => control('pause')}>❚❚</button>
        )}
        <button className="btn" title="Tick siguiente" onClick={() => stepReplay(1)}>▶|</button>
        <button className="btn" title="Momento clave siguiente" onClick={() => jumpMoment(1)}>⇥</button>
      </div>
      <div className="replay-track">
        <div className="replay-marks">
          {marks.map(([t, ms]) => (
            <button
              key={t}
              className="replay-mark"
              style={{ left: pct(t), background: momentColor(ms[0]) }}
              title={`t${t}: ${ms.map((m) => m.text).join(' · ')}`}
              aria-label={`Ir al tick ${t}: ${ms[0].text}`}
              onMouseEnter={() => setHover({ tick: t, text: ms.map((m) => m.text).join(' · ') })}
              onMouseLeave={() => setHover(null)}
              onClick={() => seekReplay(t)}
            />
          ))}
        </div>
        <input
          className="replay-slider"
          type="range"
          min={0}
          max={max}
          step={1}
          value={shown}
          aria-label="Tick"
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => {
            if (drag !== null) seekReplay(drag);
            setDrag(null);
          }}
          onKeyUp={() => {
            if (drag !== null) seekReplay(drag);
            setDrag(null);
          }}
        />
      </div>
      <div className="replay-label">
        <strong>t{label.tick}</strong>
        <span className="dim"> / {max}{timeline.times[label.tick] ? ` · ${timeline.times[label.tick]}` : ''}</span>
        {label.text && <div className="replay-hover">{label.text}</div>}
      </div>
    </div>
  );
}
