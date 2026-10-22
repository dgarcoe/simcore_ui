import { useMemo, useState } from 'react';
import { bus } from '../store/bus';
import { useSim } from '../store/simStore';
import { seekReplay } from '../store/sources';
import { edgesOf, frameAt, storyHtml, type Moment, type RelFrame } from '../store/story';

const KIND_COLOR: Record<string, string> = {
  agent_death: '#b13e53',
  condition_change: '#7bc950',
  belief_shared: '#a05fd6',
  rule_fired: '#ffcd75',
  scheduled_event: '#ffcd75',
  injected_event: '#ffcd75',
  simulation_end: '#ffcd75',
  agent_spawn: '#41a6f6',
  agent_depart: '#41a6f6',
  agent_search: '#73eff7',
};
const colorOf = (m: Moment) => KIND_COLOR[m.kind] ?? '#94b0c2';

function focus(m: Moment) {
  // In a replay, go to that moment first (the map shows the world as it was then).
  if (useSim.getState().mode === 'replay') seekReplay(m.tick);
  if (m.agents[0]) bus.emit('focusAgent', m.agents[0]);
  else if (m.place) bus.emit('focusZone', m.place);
}

/** The run as a story: the narrator's chapters, a timeline of key moments and the web of relationships. */
export function StoryPanel() {
  const chapters = useSim((s) => s.chapters);
  const moments = useSim((s) => s.moments);
  const frames = useSim((s) => s.relFrames);
  const lastTick = useSim((s) => s.lastTick);
  const sim = useSim((s) => s.sim);
  const scenario = useSim((s) => s.scenarioName);
  const endMessage = useSim((s) => s.endMessage);
  const epilogue = useSim((s) => s.epilogue);
  const [onlyKey, setOnlyKey] = useState(true);
  const replayTimeline = useSim((s) => s.replayTimeline);
  const now = sim?.clock.tick ?? 0;
  // A replay knows the whole run: list every moment (the ones still to come, dimmed) to jump to.
  const all = replayTimeline ? mergeMoments(moments, replayTimeline.moments) : moments;
  const maxTick = Math.max(lastTick, moments.at(-1)?.tick ?? 0, 1);
  const shown = all.filter((m) => !onlyKey || m.importance >= 0.5);

  const download = () => {
    const cast = Object.values(sim?.agents ?? {}).map((a) => ({
      name: a.name,
      status: a.status ?? a.state.status ?? 'alive',
      note: [a.profession, a.mind ? `${a.mind.condition}` : ''].filter(Boolean).join(' · '),
    }));
    const html = storyHtml({ title: scenario || 'Simulación', chapters, moments, cast, ending: endMessage, epilogue });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `${(scenario || 'historia').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="panel-body story">
      <div className="row space">
        <h3>Historia</h3>
        <button className="btn" onClick={download} disabled={!moments.length && !chapters.length} title="Un HTML con los capítulos, los momentos clave y el reparto">
          ⬇ Descargar relato
        </button>
      </div>
      {chapters.length > 0 ? (
        chapters.map((c) => (
          <article key={c.n} className="chapter">
            <h4>
              {c.title}{' '}
              {replayTimeline ? (
                <button className="link dim small" onClick={() => seekReplay(c.from_tick)} title="Ir al principio del capítulo">
                  t{c.from_tick}–{c.to_tick}
                </button>
              ) : (
                <span className="dim small">t{c.from_tick}–{c.to_tick}</span>
              )}
            </h4>
            <p>{c.text}</p>
          </article>
        ))
      ) : (
        <p className="dim small">
          Sin capítulos: activa la crónica en el escenario (General → «Crónica por capítulos») para que un narrador escriba la historia
          según avanza.
        </p>
      )}
      {epilogue && (
        <article className="chapter">
          <h4>Epílogo</h4>
          <p>{epilogue}</p>
        </article>
      )}

      <h4>Momentos clave</h4>
      <Timeline moments={moments} maxTick={maxTick} />
      <label className="toggle small">
        <input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> Solo los importantes
      </label>
      <ol className="moments">
        {[...shown].reverse().slice(0, 80).map((m, i) => (
          <li key={`${m.tick}-${i}`} className={replayTimeline && m.tick > now ? 'future' : ''}>
            <button className="link" onClick={() => focus(m)} title={replayTimeline ? 'Ir a este momento' : 'Ver en el mapa'}>
              <span className="dot" style={{ background: colorOf(m) }} />
              <span className="dim">t{m.tick}</span> {m.text}
            </button>
          </li>
        ))}
      </ol>

      <h4>Relaciones</h4>
      <RelationsGraph frames={frames} />
    </div>
  );
}

function Timeline({ moments, maxTick }: { moments: Moment[]; maxTick: number }) {
  const W = 300;
  const H = 34;
  return (
    <svg className="timeline" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Línea de tiempo de momentos clave">
      <line x1={0} x2={W} y1={H - 6} y2={H - 6} stroke="currentColor" strokeOpacity={0.3} />
      {moments
        .filter((m) => m.importance >= 0.4)
        .map((m, i) => (
          <circle
            key={i}
            cx={(m.tick / maxTick) * (W - 8) + 4}
            cy={H - 6 - m.importance * 22}
            r={2 + m.importance * 3}
            fill={colorOf(m)}
            style={{ cursor: 'pointer' }}
            onClick={() => focus(m)}
          >
            <title>{`t${m.tick} · ${m.text}`}</title>
          </circle>
        ))}
    </svg>
  );
}

function RelationsGraph({ frames }: { frames: RelFrame[] }) {
  const first = frames[0]?.tick ?? 0;
  const last = frames.at(-1)?.tick ?? 0;
  const [tick, setTick] = useState<number | null>(null);
  const at = tick ?? last;
  const frame = useMemo(() => frameAt(frames, at), [frames, at]);
  const people = useMemo(() => (frame ? Object.keys(frame.rels).filter((n) => frame.status[n] !== 'departed') : []), [frame]);
  if (!frame || people.length < 2) return <p className="dim small">Aún no hay relaciones que mostrar.</p>;
  const size = 300;
  const r = size / 2 - 46;
  const pos = Object.fromEntries(
    people.map((n, i) => {
      const a = (i / people.length) * Math.PI * 2 - Math.PI / 2;
      return [n, { x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) }];
    }),
  );
  const edges = edgesOf(frame).filter((e) => pos[e.a] && pos[e.b]).slice(0, 60);
  return (
    <div className="relgraph">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Relaciones en el tick ${frame.tick}`}>
        {edges.map((e, i) => {
          const A = pos[e.a];
          const B = pos[e.b];
          return (
            <g key={i}>
              <line
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={e.value >= 0 ? '#38b764' : '#b13e53'}
                strokeWidth={0.6 + Math.abs(e.value) * 3}
                strokeOpacity={0.35 + Math.abs(e.value) * 0.6}
              >
                <title>{`${e.a} — ${e.b}: ${e.value >= 0 ? '+' : ''}${e.value.toFixed(2)}${e.kind ? ` (${e.kind})` : ''}`}</title>
              </line>
              {e.kind && Math.abs(e.value) > 0.3 && (
                <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2} className="edge-label">
                  {e.kind}
                </text>
              )}
            </g>
          );
        })}
        {people.map((n) => (
          <g key={n} style={{ cursor: 'pointer' }} onClick={() => bus.emit('focusAgent', n)} opacity={frame.status[n] === 'dead' ? 0.4 : 1}>
            <circle cx={pos[n].x} cy={pos[n].y} r={5} fill={frame.status[n] === 'dead' ? '#555' : 'var(--accent)'} />
            <text x={pos[n].x} y={pos[n].y + (pos[n].y > size / 2 ? 15 : -9)} className="node-label">
              {frame.status[n] === 'dead' ? '✝ ' : ''}
              {n}
            </text>
          </g>
        ))}
      </svg>
      {last > first && (
        <label className="row small">
          <span className="dim">Tick {frame.tick}</span>
          <input type="range" min={first} max={last} value={at} onChange={(e) => setTick(Number(e.target.value) === last ? null : Number(e.target.value))} />
        </label>
      )}
    </div>
  );
}

/** What has been seen so far plus the rest of the run's key moments (a replay), without repeats. */
function mergeMoments(seen: Moment[], whole: Moment[]): Moment[] {
  const key = (m: Moment) => `${m.tick}|${m.text}`;
  const known = new Set(seen.map(key));
  return [...seen, ...whole.filter((m) => !known.has(key(m)))].sort((a, b) => a.tick - b.tick);
}
