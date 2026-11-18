import { useMemo, useState } from 'react';
import { CATEGORIES } from '../store/review';
import { useSim } from '../store/simStore';
import { control, jumpMoment, momentLink, seekReplay, shownMoments, stepReplay } from '../store/sources';
import type { Moment } from '../store/story';
import { chartModes, ReplayChart, type ChartMode } from './ReplayChart';

/** Colour of a key moment's mark on the timeline. */
export function momentColor(m: Moment): string {
  if (m.kind === 'agent_death') return '#b13e53';
  if (m.kind === 'territory_change') return '#ff3fa4';
  if (m.kind === 'agent_knockout') return '#b14fd6';
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
  const filter = useSim((s) => s.momentFilter);
  const selected = useSim((s) => s.selectedAgent);
  const factions = useSim((s) => s.sim?.society?.factions);
  const layers = useSim((s) => s.layers);
  const set = useSim((s) => s.set);
  const player = useSim((s) => s.replayMeta?.player);
  const [hover, setHover] = useState<{ tick: number; text: string } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [chart, setChart] = useState<ChartMode | ''>('');
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const moments = useMemo(() => shownMoments(), [timeline, filter, factions]);
  if (!timeline || timeline.ticks <= 0) return null;
  const modes = chartModes(timeline.series);
  const shownChart = chart || (modes[0]?.[0] ?? '');
  const max = timeline.ticks;
  const pct = (t: number) => `${(Math.min(max, Math.max(0, t)) / max) * 100}%`;
  // Several moments in the same tick share a mark: show the most important first.
  const byTick = new Map<number, Moment[]>();
  for (const m of moments) byTick.set(m.tick, [...(byTick.get(m.tick) ?? []), m]);
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
      <div className="replay-tools">
        <span className="replay-group" aria-label="Qué marcar en la línea de tiempo">
          {CATEGORIES.map(([k, l]) => {
            const off = filter.hidden.includes(k);
            return (
              <button
                key={k}
                className={`chip-btn ${off ? '' : 'on'}`}
                aria-pressed={!off}
                onClick={() => set({ momentFilter: { ...filter, hidden: off ? filter.hidden.filter((x) => x !== k) : [...filter.hidden, k] } })}
              >
                {l}
              </button>
            );
          })}
          {selected && (
            <button className={`chip-btn ${filter.agent ? 'on' : ''}`} aria-pressed={!!filter.agent} onClick={() => set({ momentFilter: { ...filter, agent: filter.agent ? null : selected, group: null } })}>
              👤 {filter.agent ?? selected}
            </button>
          )}
          {factions && Object.keys(factions).length > 0 && (
            <select className="select small" aria-label="Solo una banda" value={filter.group ?? ''} onChange={(e) => set({ momentFilter: { ...filter, group: e.target.value || null, agent: null } })}>
              <option value="">Todas las bandas</option>
              {Object.keys(factions).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          )}
        </span>
        {timeline.days.length > 1 && (
          <span className="replay-group" aria-label="Días">
            {timeline.days.map((d) => (
              <span key={d.day} className="row nowrap">
                <button className={`chip-btn ${tick >= d.start && tick <= d.end ? 'on' : ''}`} title={`Ir al principio del día ${d.day}`} onClick={() => seekReplay(d.start)}>
                  Día {d.day}
                </button>
                <button className="chip-btn" title={`Parte del día ${d.day}`} aria-label={`Parte del día ${d.day}`} onClick={() => set({ dayRecap: d.day })}>📋</button>
              </span>
            ))}
          </span>
        )}
        <span className="replay-group">
          {modes.length > 0 && (
            <>
              <button className={`chip-btn ${chart ? 'on' : ''}`} aria-pressed={!!chart} onClick={() => setChart(chart ? '' : shownChart)}>📈 Gráfica</button>
              {chart && modes.length > 1 && (
                <select className="select small" aria-label="Qué muestra la gráfica" value={chart} onChange={(e) => setChart(e.target.value as ChartMode)}>
                  {modes.map(([k, l]) => (
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
              )}
            </>
          )}
          <button
            className={`chip-btn ${layers.trail ? 'on' : ''}`}
            aria-pressed={layers.trail}
            title={selected ? `Camino de ${selected} hasta ahora` : 'Elige un agente para ver su camino'}
            disabled={!selected}
            onClick={() => set({ layers: { ...layers, trail: !layers.trail } })}
          >
            👣 Rastro
          </button>
          <button className={`chip-btn ${layers.heat ? 'on' : ''}`} aria-pressed={layers.heat} title="Dónde ha habido peleas hasta ahora" onClick={() => set({ layers: { ...layers, heat: !layers.heat } })}>
            🔥 Peleas
          </button>
          {!player && <button
            className="chip-btn"
            title="Copia un enlace a este momento (y al agente elegido)"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(momentLink());
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                window.prompt('Enlace a este momento:', momentLink());
              }
            }}
          >
            {copied ? '✓ Copiado' : '🔗 Enlace'}
          </button>}
        </span>
      </div>
      {chart && <ReplayChart series={timeline.series} ticks={max} tick={shown} mode={chart} onSeek={seekReplay} />}
    </div>
  );
}
