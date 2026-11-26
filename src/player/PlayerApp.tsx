import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  dayReport,
  appBase,
  gameLink,
  joinGame,
  myAgent,
  myResults,
  playView,
  pointsSpent,
  savedToken,
  saveMyAgent,
  saveOrders,
  saveToken,
  type DayReport,
  type PlayerResults,
  type PublicGame,
} from '../api/games';
import type { AgentConfig, Orders } from '../api/scenario';
import type { SimEvent } from '../api/types';
import { initialSnapshot, reduce } from '../store/reduce';
import { useSim } from '../store/simStore';
import { AgentForm } from './AgentForm';
import { AwardsList } from '../ui/AwardsList';
import { highlightText } from '../store/awards';
import { LivePanel } from './LivePanel';
import { ShareCard } from './ShareCard';
import { cap, setPlayerWords, useWords } from '../lib/words';
import { OrdersForm, type OrdersOptions } from './OrdersForm';

// The map and the replay player load only if the DM publishes the replay.
const App = lazy(() => import('../App').then((m) => ({ default: m.App })));

const STATUS: Record<string, string> = {
  open: 'Inscripciones abiertas',
  closed: 'Inscripciones cerradas: la partida empezará pronto',
  running: 'La partida está en marcha',
  intermission: 'Fin de la jornada: lee tu parte y cambia tus órdenes',
  finished: 'La partida ha terminado',
};

/** What a player sees: the briefing, their own agent, the other players' names and, later, what the DM publishes. */
export function PlayerApp({ code, linkToken }: { code: string; linkToken: string | null }) {
  const [game, setGame] = useState<PublicGame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(() => linkToken ?? savedToken(code));
  const [me, setMe] = useState<{ display_name: string; agent: Partial<AgentConfig>; submitted: boolean } | null>(null);
  const [draft, setDraft] = useState<Partial<AgentConfig>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [results, setResults] = useState<PlayerResults | null>(null);
  const [report, setReport] = useState<DayReport | null>(null);
  const [watching, setWatching] = useState(false);
  const mode = useSim((s) => s.mode);

  // A personal link (?yo=…) is kept in this browser and taken out of the address bar.
  useEffect(() => {
    if (linkToken) {
      saveToken(code, linkToken);
      history.replaceState(null, '', /\/jugar\//.test(location.pathname) ? location.pathname : `#/jugar/${code}`);
    }
  }, [code, linkToken]);

  const refresh = useCallback(async () => {
    try {
      const g = await playView(code);
      setPlayerWords(g.options?.words);
      setGame(g);
      setError(null);
      if (token) {
        const mine = await myAgent(code, token);
        setMe(mine);
        setDraft((d) => (Object.keys(d).length ? d : mine.agent));
        if (g.status === 'finished') setResults(await myResults(code, token));
        if (g.status === 'intermission') setReport(await dayReport(code, token).catch(() => null));
        else setReport(null);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [code, token]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (watching && mode === 'none') setWatching(false); // ⏏ in the replay: back here
  }, [watching, mode]);

  if (watching) {
    return (
      <Suspense fallback={<p className="player-page">Cargando la repetición…</p>}>
        <App />
      </Suspense>
    );
  }

  const join = async (name: string) => {
    try {
      const r = await joinGame(code, name);
      saveToken(code, r.token);
      setToken(r.token);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async (submitted?: boolean) => {
    if (!token) return;
    try {
      const r = await saveMyAgent(code, token, draft, submitted);
      setDraft(r.agent);
      setMe((m) => (m ? { ...m, agent: r.agent, submitted: r.submitted } : m));
      setStatus(submitted ? '✓ Enviado. Puedes cambiarlo mientras sigan abiertas las inscripciones.' : '✓ Guardado');
    } catch (e) {
      setStatus(`✗ ${(e as Error).message}`);
    }
  };

  const watch = async (tick?: number) => {
    if (!results?.replay) return;
    const { playReplay } = await import('../store/sources');
    setWatching(true);
    playReplay({ ...results.replay, player: results.agent }, tick !== undefined ? { tick } : undefined);
  };

  if (!game) {
    return (
      <main className="player-page">
        <h1 className="title">◆ SIMCORE</h1>
        <p className={error ? 'warn' : 'dim'}>{error ?? 'Cargando la partida…'}</p>
      </main>
    );
  }

  const open = game.status === 'open';
  const left = game.template.attribute_budget - pointsSpent(draft.attributes);

  return (
    <main className="player-page">
      <header className="player-head">
        <h1 className="title">{game.title}</h1>
        <span className="chip">{STATUS[game.status]}</span>
      </header>
      {error && <p className="warn">{error}</p>}

      {game.briefing && (
        <section className="card">
          <h2>Lo que sabes</h2>
          <p className="briefing">{game.briefing}</p>
        </section>
      )}

      {!token ? (
        <JoinCard game={game} onJoin={join} />
      ) : (
        <>
          {results && <Results results={results} game={game.title} onWatch={watch} />}
          {report && game.status === 'intermission' && (
            <DayCard
              options={playerOptions(game)}
              report={report}
              canOrder={game.template.editable.includes('orders')}
              onSave={async (orders) => {
                await saveOrders(code, token, orders);
                setDraft((d) => ({ ...d, orders }));
              }}
            />
          )}
          {(game.status === 'running' || game.status === 'intermission') && me && (
            <LivePanel code={code} token={token} agent={me.agent?.name || me.display_name} onStatus={(s) => s !== game.status && void refresh()} />
          )}
          <section className="card">
            <h2>Tu agente{me?.submitted ? ' · enviado ✓' : ''}</h2>
            <AgentForm agent={draft} template={game.template} readOnly={!open} options={playerOptions(game)} onChange={setDraft} />
            {open && (
              <div className="row">
                <button className="btn" onClick={() => save()}>Guardar</button>
                <button className="btn btn-accent" disabled={left < 0} onClick={() => save(true)}>
                  {me?.submitted ? 'Enviar de nuevo' : 'Enviar al DM'}
                </button>
                {status && <span className={status.startsWith('✗') ? 'bad-text' : 'dim'}>{status}</span>}
              </div>
            )}
          </section>
          <section className="card">
            <h2>Jugadores ({game.players.length}/{game.max_players})</h2>
            <p>{game.players.join(' · ') || 'Aún no hay nadie.'}</p>
            <PersonalLink code={code} token={token} />
          </section>
        </>
      )}
    </main>
  );
}

function JoinCard({ game, onJoin }: { game: PublicGame; onJoin: (name: string) => void }) {
  const [name, setName] = useState('');
  if (game.status !== 'open') return <p className="warn">Las inscripciones de esta partida están cerradas.</p>;
  return (
    <section className="card">
      <h2>Únete</h2>
      <p className="dim">
        {game.players.length}/{game.max_players} jugadores. Al unirte, este navegador recordará tu plaza.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <input className="input grow" placeholder="Tu nombre (lo verán los demás jugadores)" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-accent" type="submit" disabled={!name.trim()}>Unirme</button>
      </form>
    </section>
  );
}

function PersonalLink({ code, token }: { code: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const link = gameLink(appBase(), code, token);
  return (
    <details className="personal-link">
      <summary>Tu enlace personal para volver desde otro dispositivo</summary>
      <p className="dim small">No lo compartas: con él se puede cambiar tu agente.</p>
      <div className="row">
        <input className="input grow" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button
          className="btn"
          onClick={async () => {
            await navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </details>
  );
}

/** What the agent lived, as feed lines (others idling left out). */
function livedLines(events: SimEvent[], agent: string | undefined) {
  let s = initialSnapshot();
  // Others act in it too: don't drop their events as leftovers of another run.
  for (const e of events) s = { ...(reduce(s, e) ?? s), runAgents: null };
  return s.feed.filter((f) => f.source === agent || !/^(waits|observes)/.test(f.text));
}

/** How the agent followed its orders: plans that applied and red lines that stopped it. */
function ordersReport(events: SimEvent[], agent: string | undefined) {
  const mine = events.filter((e) => e.type === 'orders' && (e.data.agent ?? e.source) === agent);
  const plans = [...new Set(mine.filter((e) => e.data.kind === 'plan').map((e) => String(e.data.text)))];
  const stops = mine.filter((e) => e.data.kind === 'red_line').length;
  const acts: Record<string, number> = {};
  for (const e of events)
    if (e.type === 'agent_action' && e.source === agent) {
      const k = String(e.data.name ?? e.data.action_type ?? '');
      if (k && k !== 'wait') acts[k] = (acts[k] ?? 0) + 1;
    }
  const top = Object.entries(acts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { plans, stops, top };
}

function OrdersReport({ events, agent }: { events: SimEvent[]; agent: string | undefined }) {
  const r = useMemo(() => ordersReport(events, agent), [events, agent]);
  if (!r.plans.length && !r.stops && !r.top.length) return null;
  return (
    <div className="orders-report">
      <h3>Cómo siguió tus órdenes</h3>
      {r.top.length > 0 && <p>Lo que más hizo: {r.top.map(([k, n]) => `${k.replace(/_/g, ' ')} (${n})`).join(', ')}.</p>}
      {r.plans.length > 0 ? <p>Planes que se activaron: {r.plans.map((p) => `«${p}»`).join('; ')}.</p> : <p className="dim">No se activó ninguno de tus planes.</p>}
      {r.stops > 0 && <p>Tus líneas rojas le frenaron {r.stops} {r.stops === 1 ? 'vez' : 'veces'}.</p>}
    </div>
  );
}

function DayCard({ report, canOrder, options, onSave }: { report: DayReport; canOrder: boolean; options: OrdersOptions; onSave: (o: Orders) => Promise<void> }) {
  const w = useWords();
  const [orders, setOrders] = useState<Orders>(report.orders ?? {});
  const [status, setStatus] = useState<string | null>(null);
  const lived = useMemo(() => livedLines(report.diary.events, report.agent), [report]);
  return (
    <section className="card day-card">
      <h2>🌙 Fin del día {report.day}</h2>
      {report.rank !== null && (
        <p>
          {report.agent}: <strong>{report.points} puntos</strong>, puesto {report.rank} de {report.players}.
        </p>
      )}
      {report.groups.length > 0 && (
        <p>
          {cap(w.groups)}: {report.groups.map((g, i) => `${i + 1}. ${g.group} (${g.points})`).join(' · ')}
        </p>
      )}
      {Object.keys(report.territories).length > 0 && (
        <p className="small">
          {cap(w.territories)}: {Object.entries(report.territories).map(([p, t]) => `${p}: ${t.owner || 'de nadie'}${t.siege ? ` (asedio de ${t.siege.by} ${t.siege.progress}/${t.siege.needed})` : t.contested ? ' (en disputa)' : ''}`).join(' · ')}
        </p>
      )}
      <details>
        <summary>Lo que vivió hoy tu agente ({lived.length})</summary>
        <ol className="diary">
          {lived.map((f) => (
            <li key={f.id}>
              <span className="tick">t{f.tick}</span> {f.source && <strong>{f.source}</strong>} {f.text}
            </li>
          ))}
        </ol>
      </details>
      <OrdersReport events={report.diary.events} agent={report.agent} />
      {canOrder && (
        <>
          <h3>Tus órdenes para mañana</h3>
          <OrdersForm orders={orders} options={options} onChange={setOrders} />
          <div className="row">
            <button
              className="btn btn-accent"
              onClick={async () => {
                try {
                  await onSave(orders);
                  setStatus('✓ Guardadas: tu agente las seguirá cuando el DM reanude la partida.');
                } catch (e) {
                  setStatus(`✗ ${(e as Error).message}`);
                }
              }}
            >
              Guardar órdenes
            </button>
            {status && <span className={status.startsWith('✗') ? 'bad-text' : 'dim'}>{status}</span>}
          </div>
        </>
      )}
    </section>
  );
}

function Results({ results, game, onWatch }: { results: PlayerResults; game: string; onWatch: (tick?: number) => void }) {
  const w = useWords();
  const lived = useMemo(() => (results.diary ? livedLines(results.diary.events, results.agent) : []), [results.diary, results.agent]);
  const r = results.result;
  const anything = results.result || results.diary || results.replay;
  return (
    <section className="card">
      <h2>Resultados</h2>
      {!anything && <p className="dim">La partida ha terminado. El DM aún no ha publicado los resultados.</p>}
      {results.result && (
        <>
          {results.result.message && <p className="end-message">{results.result.message}</p>}
          {r?.winner && <p>👑 Gana: <strong>{r.winner}</strong>{r.mvp && r.mvp !== r.winner ? <> · ⭐ más puntos: <strong>{r.mvp}</strong></> : null}</p>}
          {r?.rank && (
            <p>
              Tú: <strong>{r.points} puntos</strong>, puesto {r.rank} de {r.players}.
            </p>
          )}
          {r?.groups && <p className="small">{cap(w.groups)}: {r.groups.map((g, i) => `${i + 1}. ${g.group} (${g.points})`).join(' · ')}</p>}
          <p>
            {results.agent}: {results.result.alive ? <strong className="ok-text">sigue en pie</strong> : <strong className="bad-text">no llegó al final</strong>}
            <span className="dim"> · {results.result.ticks} ticks</span>
          </p>
        </>
      )}
      <AwardsList awards={results.awards ?? []} me={results.agent} />
      {results.rivals && (results.rivals.nemesis || results.rivals.victim) && (
        <p>
          {results.rivals.nemesis && (
            <>
              😠 Tu némesis: <strong>{results.rivals.nemesis.agent}</strong> (te tumbó {results.rivals.nemesis.times} {results.rivals.nemesis.times === 1 ? 'vez' : 'veces'}){results.rivals.victim ? ' · ' : ''}
            </>
          )}
          {results.rivals.victim && (
            <>
              🎯 Tu víctima favorita: <strong>{results.rivals.victim.agent}</strong> ({results.rivals.victim.times} {results.rivals.victim.times === 1 ? 'vez' : 'veces'})
            </>
          )}
        </p>
      )}
      {results.highlights && results.highlights.length > 0 && (
        <>
          <strong>⭐ Tus momentos</strong>
          <ol className="highlights">
            {results.highlights.map((h, i) => (
              <li key={i}>
                <span className="tick">t{h.tick}</span> {highlightText(h)}
                {results.replay && (
                  <button className="link" style={{ marginLeft: 8 }} onClick={() => onWatch(h.tick)}>▶ verlo</button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {r && <ShareCard results={results} game={game} />}
      {results.replay && (
        <>
          <button className="btn btn-accent" onClick={() => onWatch()}>▶ Ver la repetición siguiendo a {results.agent}</button>
          <p className="dim small">Con la ficha de tu agente (lo que hizo y por qué, sus puntos y tus órdenes), la gráfica de la partida y el parte de cada día. Las órdenes de los demás no se ven.</p>
        </>
      )}
      {results.diary && (
        <>
          <OrdersReport events={results.diary.events} agent={results.agent} />
          <h3>Diario de {results.agent}</h3>
          <p className="dim small">Solo lo que tu agente vivió: lo que hizo, lo que le dijeron, lo que pasó donde estaba y las noticias que llegaron a todos.</p>
          <ol className="diary">
            {lived.map((f) => (
              <li key={f.id}>
                <span className="tick">t{f.tick}</span> {f.source && <strong>{f.source}</strong>} {f.text}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** What the scenario offers a player for their orders (groups only if they can have one). */
function playerOptions(game: PublicGame): OrdersOptions {
  const o = game.options ?? {};
  return { ...o, groups: o.groups ?? (game.template.editable.includes('faction') || !!game.template.factions?.length || !!o.territories) };
}
