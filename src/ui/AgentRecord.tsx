import { useEffect, useMemo, useRef, useState } from 'react';
import { ordersSummary } from '../player/OrdersForm';
import { agentTrail } from '../store/review';
import { useSim } from '../store/simStore';
import { seekReplay } from '../store/sources';

/** Replays: an agent through the whole run — what it did and why, its rolls, points and orders. */
export function AgentRecord({ name }: { name: string }) {
  const events = useSim((s) => s.replayEvents);
  const times = useSim((s) => s.replayTimeline?.times);
  const tick = useSim((s) => s.sim?.clock.tick ?? 0);
  const orders = useSim((s) => s.scenarioConfig?.agents?.find((a) => a.name === name)?.orders);
  const [open, setOpen] = useState(true);
  const [onlyKey, setOnlyKey] = useState(false);
  const [trace, setTrace] = useState<number | null>(null);
  const nowRef = useRef<HTMLLIElement>(null);
  const rows = useMemo(() => (events ? agentTrail(events, name, times) : []), [events, name, times]);
  const shown = onlyKey ? rows.filter((r) => r.items.some((i) => i.icon !== '⏳' && i.icon !== '🚶' && i.icon !== '💬' && i.icon !== '👂')) : rows;
  const current = shown.filter((r) => r.tick <= tick).at(-1)?.tick;
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);
  if (!events) return null;

  const points = rows.map((r) => r.points).filter((p): p is number => p !== undefined);
  const plans = rows.flatMap((r) => r.items).filter((i) => i.icon === '📜').length;
  const lines = rows.flatMap((r) => r.items).filter((i) => i.icon === '⛔').length;
  const failed = rows.flatMap((r) => r.items).filter((i) => i.tone === 'bad' && i.why !== undefined).length;

  return (
    <div className="player-block agent-record">
      <div className="row between">
        <h4>📼 Su partida</h4>
        <button className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Ocultar' : 'Ver'}</button>
      </div>
      {open && (
        <>
          {orders && <p className="small">📜 Órdenes: {ordersSummary(orders)}</p>}
          <p className="small dim">
            {rows.length} turnos con algo que contar
            {plans ? ` · ${plans} planes activados` : ''}
            {lines ? ` · ${lines} veces le frenó su línea roja` : ''}
            {failed ? ` · ${failed} acciones fallidas` : ''}
          </p>
          {points.length > 1 && <Spark values={points} />}
          <label className="toggle small">
            <input type="checkbox" checked={onlyKey} onChange={(e) => setOnlyKey(e.target.checked)} /> Solo lo importante (sin esperas, paseos ni charla)
          </label>
          <ol className="trail">
            {shown.map((r) => (
              <li key={r.tick} ref={r.tick === current ? nowRef : undefined} className={r.tick === current ? 'now' : r.tick > tick ? 'future' : ''}>
                <div className="trail-head">
                  <button className="link" onClick={() => seekReplay(r.tick)} title="Ir a este momento">t{r.tick}</button>
                  <span className="dim">{r.time}{r.place ? ` · ${r.place}` : ''}{r.points !== undefined ? ` · ${r.points} pts` : ''}</span>
                  {r.trace && (
                    <button className="link" onClick={() => setTrace(trace === r.tick ? null : r.tick)}>🧠 {trace === r.tick ? 'Ocultar' : 'Prompt'}</button>
                  )}
                </div>
                {r.items.map((i, k) => (
                  <div key={k} className={i.tone === 'bad' ? 'bad-text' : i.tone === 'good' ? 'good-text' : ''}>
                    {i.icon} {i.text}
                    {i.why && <span className="why dim">«{i.why}»</span>}
                  </div>
                ))}
                {r.trace && trace === r.tick && (
                  <div>
                    <p className="small"><strong>Sistema</strong></p>
                    <pre className="trace">{r.trace.system}</pre>
                    <p className="small"><strong>Lo que vio</strong></p>
                    <pre className="trace">{r.trace.prompt}</pre>
                    <p className="small"><strong>Lo que respondió el modelo</strong></p>
                    <pre className="trace">{r.trace.answer}</pre>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {!rows.some((r) => r.trace) && (
            <p className="dim small">Para ver el prompt y la respuesta del modelo de cada decisión, lanza el escenario con «Guardar los prompts» (llm.record_prompts).</p>
          )}
        </>
      )}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 200},${34 - ((v - lo) / (hi - lo)) * 30}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 200 36" preserveAspectRatio="none" role="img" aria-label={`Puntos: de ${values[0]} a ${values.at(-1)}`}>
      <polyline points={pts} fill="none" stroke="#ffcd75" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
