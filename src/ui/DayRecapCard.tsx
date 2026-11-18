import { useMemo } from 'react';
import { cap, useWords } from '../lib/words';
import { dayRecap } from '../store/review';
import { useSim } from '../store/simStore';
import { seekReplay } from '../store/sources';

/** Replays: the summary of a day for everybody, over the map. */
export function DayRecapCard() {
  const day = useSim((s) => s.dayRecap);
  const timeline = useSim((s) => s.replayTimeline);
  const events = useSim((s) => s.replayEvents);
  const set = useSim((s) => s.set);
  const w = useWords();
  const recap = useMemo(() => {
    const d = timeline?.days.find((x) => x.day === day);
    return d && events ? dayRecap(events, timeline!.moments, d) : null;
  }, [day, timeline, events]);
  if (!recap) return null;
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  const next = timeline!.days.find((d) => d.day === recap.day + 1);

  return (
    <div className="day-recap" role="dialog" aria-label={`Parte del día ${recap.day}`}>
      <div className="row between">
        <h3>📋 Parte del día {recap.day}</h3>
        <button className="btn" aria-label="Cerrar" onClick={() => set({ dayRecap: null })}>✕</button>
      </div>
      <p className="dim small">
        Ticks {recap.from}–{recap.to} · {recap.counts.captures} {w.territories} cambian de manos · {recap.counts.knockouts} K.O.
        {recap.counts.deaths ? ` · ${recap.counts.deaths} muertes` : ''}
      </p>
      {recap.groups.length > 0 && (
        <>
          <strong>🏴 {cap(w.groups)} al acabar el día</strong>
          <ol>
            {recap.groups.map((g) => (
              <li key={g.group}>
                {g.group} — {g.points} puntos (<span className={g.gained < 0 ? 'bad-text' : ''}>{sign(g.gained)}</span>)
                {g.territories ? ` · ${g.territories} ${w.territories}` : ''}
              </li>
            ))}
          </ol>
        </>
      )}
      {recap.people.length > 0 && (
        <>
          <strong>⭐ Quién más subió</strong>
          <ol>
            {recap.people.map((p) => (
              <li key={p.agent}>
                <button className="link" onClick={() => set({ selectedAgent: p.agent })}>{p.agent}</button> {sign(p.gained)} (total {p.points})
              </li>
            ))}
          </ol>
        </>
      )}
      {recap.moments.length > 0 && (
        <>
          <strong>📖 Lo más sonado</strong>
          <ul>
            {recap.moments.map((m, i) => (
              <li key={i}>
                <button className="link" onClick={() => seekReplay(m.tick)}>t{m.tick}</button> {m.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="row">
        <button className="btn" onClick={() => { seekReplay(recap.to); set({ dayRecap: null }); }}>Ver el final del día</button>
        {next && <button className="btn btn-accent" onClick={() => { seekReplay(next.start); set({ dayRecap: null }); }}>▶ Día {next.day}</button>}
      </div>
    </div>
  );
}
