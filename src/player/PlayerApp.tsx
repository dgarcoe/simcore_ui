import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  gameLink,
  joinGame,
  myAgent,
  myResults,
  playView,
  pointsSpent,
  savedToken,
  saveMyAgent,
  saveToken,
  type PlayerResults,
  type PublicGame,
} from '../api/games';
import type { AgentConfig } from '../api/scenario';
import { initialSnapshot, reduce } from '../store/reduce';
import { useSim } from '../store/simStore';
import { AgentForm } from './AgentForm';

// The map and the replay player load only if the DM publishes the replay.
const App = lazy(() => import('../App').then((m) => ({ default: m.App })));

const STATUS: Record<string, string> = {
  open: 'Inscripciones abiertas',
  closed: 'Inscripciones cerradas: la partida empezará pronto',
  running: 'La partida está en marcha',
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
  const [watching, setWatching] = useState(false);
  const mode = useSim((s) => s.mode);

  // A personal link (?yo=…) is kept in this browser and taken out of the address bar.
  useEffect(() => {
    if (linkToken) {
      saveToken(code, linkToken);
      history.replaceState(null, '', `#/jugar/${code}`);
    }
  }, [code, linkToken]);

  const refresh = useCallback(async () => {
    try {
      const g = await playView(code);
      setGame(g);
      setError(null);
      if (token) {
        const mine = await myAgent(code, token);
        setMe(mine);
        setDraft((d) => (Object.keys(d).length ? d : mine.agent));
        if (g.status === 'finished') setResults(await myResults(code, token));
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

  const watch = async () => {
    if (!results?.replay) return;
    const { playReplay } = await import('../store/sources');
    setWatching(true);
    playReplay(results.replay);
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
          {results && <Results results={results} onWatch={watch} />}
          <section className="card">
            <h2>Tu agente{me?.submitted ? ' · enviado ✓' : ''}</h2>
            <AgentForm agent={draft} template={game.template} readOnly={!open} onChange={setDraft} />
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
  const link = gameLink(location.origin + location.pathname.replace(/\/$/, ''), code, token);
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

function Results({ results, onWatch }: { results: PlayerResults; onWatch: () => void }) {
  const lived = useMemo(() => {
    if (!results.diary) return [];
    let s = initialSnapshot();
    // Others act in it too: don't drop their events as leftovers of another run.
    for (const e of results.diary.events) s = { ...(reduce(s, e) ?? s), runAgents: null };
    // Others standing around doing nothing is noise.
    return s.feed.filter((f) => f.source === results.agent || !/^(waits|observes)/.test(f.text));
  }, [results.diary, results.agent]);
  const anything = results.result || results.diary || results.replay;
  return (
    <section className="card">
      <h2>Resultados</h2>
      {!anything && <p className="dim">La partida ha terminado. El DM aún no ha publicado los resultados.</p>}
      {results.result && (
        <>
          {results.result.message && <p className="end-message">{results.result.message}</p>}
          <p>
            {results.agent}: {results.result.alive ? <strong className="ok-text">sigue en pie</strong> : <strong className="bad-text">no llegó al final</strong>}
            <span className="dim"> · {results.result.ticks} ticks</span>
          </p>
        </>
      )}
      {results.replay && (
        <button className="btn btn-accent" onClick={onWatch}>▶ Ver la repetición</button>
      )}
      {results.diary && (
        <>
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
