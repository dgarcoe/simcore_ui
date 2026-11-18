import { useEffect, useMemo, useRef, useState } from 'react';
import { liveView, type LiveView } from '../api/games';
import type { SimEvent } from '../api/types';
import { cap, useWords } from '../lib/words';
import { initialSnapshot, reduce } from '../store/reduce';

const POLL_MS = 3000;
const KEEP = 1500;

/** What the player's agent lives, as it happens: its state, where it is, and its diary. */
export function LivePanel({ code, token, agent, onStatus }: { code: string; token: string; agent?: string; onStatus?: (s: string) => void }) {
  const w = useWords();
  const [view, setView] = useState<LiveView | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const since = useRef(0);
  const seen = useRef(0);
  const statusCb = useRef(onStatus);
  statusCb.current = onStatus;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await liveView(code, token, since.current);
        if (stop) return;
        since.current = v.next;
        setView(v);
        if (v.events.length) setEvents((old) => [...old, ...v.events].slice(-KEEP));
        setError(null);
        statusCb.current?.(v.status);
        if (v.status === 'finished') return;
      } catch (e) {
        const msg = (e as Error).message;
        if (/404|not found/i.test(msg)) {
          // an older Simcore without live follow: say so once and stop asking
          if (!stop) setError('Este Simcore no ofrece el seguimiento en directo (el DM debe actualizarlo).');
          return;
        }
        if (!stop) setError(msg);
      }
      if (!stop) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [code, token]);

  const lines = useMemo(() => {
    let s = initialSnapshot();
    for (const e of events) s = { ...(reduce(s, e) ?? s), runAgents: null };
    return s.feed.filter((f) => f.source === agent || !/^(waits|observes)/.test(f.text)).reverse();
  }, [events, agent]);
  const fresh = lines.length - seen.current;
  useEffect(() => {
    seen.current = lines.length;
  }, [lines.length]);

  if (!view?.me) {
    return (
      <section className="card" aria-live="polite">
        <h2>📡 En directo</h2>
        <p className="dim">{error ?? 'Conectando con la partida…'}</p>
      </section>
    );
  }
  const { me, world } = view;
  const health = typeof me.health === 'number' ? Math.round(me.health * 100) : null;
  const items = Object.entries(me.resources ?? {}).filter(([, n]) => Number(n) > 0);

  return (
    <section className="card">
      <div className="row between">
        <h2>📡 {me.name} en directo</h2>
        <span className="dim small">{world?.clock?.time ?? ''}{world?.clock ? ` · tick ${world.clock.tick}/${world.clock.max_ticks}` : ''}</span>
      </div>
      {error && <p className="warn small">Sin conexión: {error}. Reintentando…</p>}
      <div className="live-grid">
        <div>
          <p>
            📍 <strong>{me.location || '—'}</strong>
            {me.status && me.status !== 'alive' ? <strong className="bad-text"> · {me.status === 'dead' ? 'ha muerto' : me.status}</strong> : null}
          </p>
          {health !== null && (
            <p>
              ❤ Salud {health} %
              <span className="bar" aria-hidden style={{ display: 'inline-block', width: 80, height: 6, marginLeft: 6, background: '#333c57' }}>
                <span style={{ display: 'block', width: `${health}%`, height: '100%', background: health > 50 ? '#38b764' : health > 25 ? '#ffcd75' : '#b13e53' }} />
              </span>
            </p>
          )}
          {typeof me.energy === 'number' && (
            <p>
              ⚡ Energía {Math.round(me.energy * 100)} %
              <span className="bar" aria-hidden style={{ display: 'inline-block', width: 80, height: 6, marginLeft: 6, background: '#333c57' }}>
                <span style={{ display: 'block', width: `${Math.round(me.energy * 100)}%`, height: '100%', background: me.energy > 0.3 ? '#41a6f6' : me.energy > 0.15 ? '#ffcd75' : '#b13e53' }} />
              </span>
              {me.energy <= 0.15 && <span className="bad-text small"> · agotado: si llega a 0 cae rendido</span>}
            </p>
          )}
          {me.conditions && me.conditions.length > 0 && <p className="small">Estado: {me.conditions.join(', ')}</p>}
          {me.points !== undefined && (
            <p>
              🏆 <strong>{me.points} puntos</strong> · puesto {me.rank} de {me.players}
            </p>
          )}
          {me.group && <p className="small">🏴 {me.group}</p>}
          {items.length > 0 && <p className="small">🎒 {items.map(([k, n]) => `${k} ×${n}`).join(' · ')}</p>}
          {world?.group_ranking && (
            <p className="small dim">{cap(w.groups)}: {world.group_ranking.map((g, i) => `${i + 1}. ${g.group} (${g.points})`).join(' · ')}</p>
          )}
        </div>
        {world && <MiniMap world={world} here={me.location} />}
      </div>
      <h3>Lo que está viviendo</h3>
      <ol className="live-feed" aria-live="polite">
        {lines.slice(0, 120).map((f, i) => (
          <li key={f.id} className={i < fresh ? 'new' : ''}>
            <span className="tick">t{f.tick}</span> {f.source && <strong>{f.source}</strong>} {f.text}
          </li>
        ))}
        {lines.length === 0 && <li className="dim">Aún no ha pasado nada.</li>}
      </ol>
    </section>
  );
}

/** The places on a little grid, coloured by who holds them, with «you are here». */
function MiniMap({ world, here }: { world: NonNullable<LiveView['world']>; here?: string }) {
  const places = world.places;
  const xs = [...new Set(places.map((p) => p.position?.[0] ?? 0))].sort((a, b) => a - b);
  const ys = [...new Set(places.map((p) => p.position?.[1] ?? 0))].sort((a, b) => a - b);
  const taken = new Set<string>();
  const cells = places.map((p) => {
    let c = xs.indexOf(p.position?.[0] ?? 0);
    const r = ys.indexOf(p.position?.[1] ?? 0);
    while (taken.has(`${c},${r}`)) c++;
    taken.add(`${c},${r}`);
    return { ...p, c, r };
  });
  const cols = Math.max(1, ...cells.map((c) => c.c + 1));
  const rows = Math.max(1, ...cells.map((c) => c.r + 1));
  const W = 100;
  const H = 74;
  const cx = (c: number) => ((c + 0.5) / cols) * W;
  const cy = (r: number) => 4 + ((r + 0.5) / rows) * (H - 4);
  return (
    <svg className="minimap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mapa: estás en ${here ?? '—'}`}>
      {cells.map((p) => {
        const owner = p.territory?.owner;
        const color = owner ? world.groups[owner] || '#94b0c2' : '#566c86';
        const mine = p.name === here;
        const fight = !!p.territory?.contested?.length;
        return (
          <g key={p.name}>
            <rect x={cx(p.c) - 9} y={cy(p.r) - 6} width={18} height={12} rx={1.5} fill={color} fillOpacity={owner ? 0.75 : 0.35} stroke={fight ? '#ef7d57' : mine ? '#f4f4f4' : '#1a1c2c'} strokeWidth={fight || mine ? 1.2 : 0.5}>
              {fight && <animate attributeName="stroke-opacity" values="1;0.2;1" dur="1s" repeatCount="indefinite" />}
            </rect>
            <text x={cx(p.c)} y={cy(p.r) + 1} textAnchor="middle" fontSize={2.8} fill="#f4f4f4">{p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name}</text>
            {p.territory?.siege && (
              <text x={cx(p.c)} y={cy(p.r) + 4.5} textAnchor="middle" fontSize={2.3} fill="#ffcd75">asedio {p.territory.siege.progress}/{p.territory.siege.needed}</text>
            )}
            {mine && (
              <text x={cx(p.c)} y={cy(p.r) - 7} textAnchor="middle" fontSize={3} fill="#ff3fa4" fontWeight="bold">▼ TÚ</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
