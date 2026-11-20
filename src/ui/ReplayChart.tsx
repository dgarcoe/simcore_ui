import { useState } from 'react';
import { cap, DEFAULT_WORDS, type Words } from '../lib/words';
import type { Series } from '../store/review';

export type ChartMode = 'turf' | 'groups' | 'people' | 'wealth' | 'rich' | 'downs';

const PEOPLE = ['#ffcd75', '#3fe8ff', '#ff3fa4', '#a7f070', '#b14fd6'];
const W = 1000;
const H = 84;

/** Chart modes that have data in this run. */
export function chartModes(series: Series, w: Words = DEFAULT_WORDS): Array<[ChartMode, string]> {
  const groups = Object.values(series.groups);
  const out: Array<[ChartMode, string]> = [];
  if (groups.some((g) => g.territories.some((n) => n > 0))) out.push(['turf', `${cap(w.territories)} por ${w.group}`]);
  if (groups.some((g) => g.points.some((n) => n !== 0))) out.push(['groups', `Puntos por ${w.group}`]);
  if (Object.keys(series.agents).length) out.push(['people', 'Puntos del top 5']);
  if (Object.keys(series.groupWealth ?? {}).length) out.push(['wealth', `Dinero por ${w.group}`]);
  if (Object.keys(series.richest ?? {}).length) out.push(['rich', 'Los 5 más ricos']);
  if (Object.keys(series.groupDowns ?? {}).length) out.push(['downs', `Rivales tumbados por ${w.group}`]);
  return out;
}

/** The run over time under the timeline: territories or points; click to jump there. */
export function ReplayChart({ series, ticks, tick, mode, onSeek }: { series: Series; ticks: number; tick: number; mode: ChartMode; onSeek: (t: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (t: number) => (Math.min(ticks, Math.max(0, t)) / Math.max(1, ticks)) * W;
  const groups = Object.entries(series.groups);
  const lines: Array<{ name: string; color: string; values: number[] }> =
    mode === 'people' || mode === 'rich'
      ? Object.entries(mode === 'rich' ? series.richest : series.agents).map(([name, values], i) => ({ name, color: PEOPLE[i % PEOPLE.length], values }))
      : mode === 'wealth' || mode === 'downs'
        ? Object.entries(mode === 'downs' ? series.groupDowns : series.groupWealth).map(([name, values], i) => ({ name, color: series.groups[name]?.color || PEOPLE[i % PEOPLE.length], values }))
        : groups.map(([name, g], i) => ({ name, color: g.color || PEOPLE[i % PEOPLE.length], values: mode === 'turf' ? g.territories : g.points }));
  const idx = (t: number) => {
    let best = 0;
    series.ticks.forEach((s, i) => {
      if (s <= t) best = i;
    });
    return best;
  };

  let paths: JSX.Element[];
  if (mode === 'turf') {
    // stacked areas: each group on top of the ones before
    const totals = series.ticks.map((_, i) => lines.reduce((sum, l) => sum + l.values[i], 0));
    const max = Math.max(1, ...totals);
    const y = (v: number) => H - (v / max) * (H - 4);
    const base = new Array(series.ticks.length).fill(0);
    paths = lines.map((l) => {
      const top = base.map((b, i) => b + l.values[i]);
      const up = series.ticks.map((t, i) => `${x(t)},${y(top[i])}`);
      const down = series.ticks.map((t, i) => `${x(t)},${y(base[i])}`).reverse();
      top.forEach((v, i) => (base[i] = v));
      return <polygon key={l.name} points={[...up, ...down].join(' ')} fill={l.color} fillOpacity={0.75} stroke={l.color} strokeWidth={1} />;
    });
  } else {
    const all = lines.flatMap((l) => l.values);
    const lo = Math.min(0, ...all);
    const hi = Math.max(1, ...all);
    const y = (v: number) => H - 3 - ((v - lo) / (hi - lo)) * (H - 8);
    paths = lines.map((l) => (
      <polyline key={l.name} points={series.ticks.map((t, i) => `${x(t)},${y(l.values[i])}`).join(' ')} fill="none" stroke={l.color} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    ));
  }

  const at = hover ?? tick;
  const i = idx(at);
  const values = lines
    .map((l) => ({ name: l.name, color: l.color, v: l.values[i] ?? 0 }))
    .sort((a, b) => b.v - a.v);

  return (
    <div className="replay-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Evolución de la partida"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.round(((e.clientX - r.left) / r.width) * ticks));
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - r.left) / r.width) * ticks));
        }}
      >
        {paths}
        <line x1={x(tick)} x2={x(tick)} y1={0} y2={H} stroke="#f4f4f4" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="#f4f4f4" strokeOpacity={0.4} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="replay-chart-legend">
        <strong>t{at}</strong>
        {values.map((v) => (
          <span key={v.name}>
            <i style={{ background: v.color }} /> {v.name} <b>{v.v}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
