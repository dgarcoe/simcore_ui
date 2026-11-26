import { useEffect, useState } from 'react';
import {
  createGame,
  deleteGame,
  EDITABLE_FIELDS,
  addBots,
  editPlayer,
  removeBots,
  appBase,
  authMe,
  gameLink,
  listGames,
  pointsSpent,
  updateGame,
  type Game,
  type GameTemplate,
} from '../api/games';
import type { ScenarioRecord } from '../api/types';
import { control } from '../api/client';
import { ordersSummary } from '../player/OrdersForm';
import { launchGameRun } from '../store/sources';
import { SKILLS } from '../store/rpg';

const STATUS: Record<string, string> = {
  open: 'inscripciones abiertas',
  closed: 'inscripciones cerradas',
  running: 'en marcha',
  intermission: 'entre jornadas',
  finished: 'terminada',
};

const NEW_TEMPLATE: GameTemplate & { fixed: Record<string, unknown> } = {
  editable: ['name', 'profession', 'age', 'personality', 'goals', 'backstory'],
  fixed: {},
  attribute_budget: 6,
  attribute_min: 6,
  attribute_max: 16,
  max_skills: 2,
  professions: [],
  max_text: 600,
  max_goals: 4,
};

/** Dungeon masters: games where each player configures their own agent without seeing the rest. */
export function GamesSection({ scenarios, demo, speed }: { scenarios: ScenarioRecord[]; demo: boolean; speed: number }) {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Game> | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const [unsupported, setUnsupported] = useState(false);
  // Without SIMCORE_DM_PASSWORD anyone reaching the address is a DM, players included.
  const [unprotected, setUnprotected] = useState(false);
  useEffect(() => {
    authMe().then((me) => setUnprotected(!me.required)).catch(() => {});
  }, []);
  const reload = () =>
    listGames()
      .then(setGames)
      .catch((e) => (/^404|^405/.test((e as Error).message) ? setUnsupported(true) : setError((e as Error).message)));
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 10000);
    return () => clearInterval(t);
  }, []);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (unsupported || (games === null && !error)) return null; // an older Simcore without games

  return (
    <section className="card games">
      <div className="row space">
        <h2>Partidas con jugadores</h2>
        <button className="btn btn-accent" onClick={() => setEditing({ title: '', briefing: '', max_players: 6, template: NEW_TEMPLATE, scenario_id: scenarios[0]?.id })}>
          + Nueva partida
        </button>
      </div>
      <p className="dim">
        Cada jugador abre el enlace de la partida, se une con su nombre y configura su agente sin ver los de los demás ni la simulación.
      </p>
      {unprotected && (
        <p className="warn">
          🔓 Simcore no tiene contraseña de DM: quien abra la dirección principal (o quite <code>/jugar/…</code> de su enlace) entra como DM y ve
          la simulación y los agentes de todos. Para partidas con jugadores, pon <code>SIMCORE_DM_PASSWORD=…</code> en el <code>.env</code> y
          reinicia (<code>docker compose up -d</code>): entonces la dirección principal pide contraseña y los enlaces de jugador solo abren su partida.
        </p>
      )}
      {error && <p className="warn">{error}</p>}
      {editing && (
        <GameForm
          game={editing}
          scenarios={scenarios}
          onCancel={() => setEditing(null)}
          onSave={(g) =>
            act(async () => {
              if (g.id) await updateGame(g.id, g);
              else await createGame(g);
              setEditing(null);
            })
          }
        />
      )}
      <ul className="scenario-list">
        {(games ?? []).map((g) => {
          const link = gameLink(appBase(), g.code);
          const ready = g.players.filter((p) => p.submitted).length;
          return (
            <li key={g.id} className="game-row">
              <div className="grow">
                <strong>{g.title}</strong>{' '}
                <span className="dim">
                  · {scenarios.find((s) => s.id === g.scenario_id)?.meta.name ?? g.scenario_id} · {STATUS[g.status]} · {g.players.length}/{g.max_players} jugadores ({ready} enviados)
                </span>
                <div className="row wrap game-link">
                  <code>{g.code}</code>
                  <input className="input grow" readOnly value={link} onFocus={(e) => e.target.select()} />
                  <button className="btn" onClick={() => navigator.clipboard?.writeText(link)}>Copiar enlace</button>
                </div>
                {open === g.id && <GameDetail game={g} demo={demo} speed={speed} act={act} onEdit={() => setEditing(g)} />}
              </div>
              <button className="btn" onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? 'Cerrar' : 'Gestionar'}</button>
            </li>
          );
        })}
        {games?.length === 0 && <li className="dim">Aún no hay ninguna.</li>}
      </ul>
    </section>
  );
}

function GameDetail({ game: g, demo, speed, act, onEdit }: { game: Game; demo: boolean; speed: number; act: (fn: () => Promise<unknown>) => Promise<void>; onEdit: () => void }) {
  // Shown at once; saved in the background.
  const [shown, setShown] = useState(g.publish);
  useEffect(() => setShown(g.publish), [g.publish]);
  const publish = (key: 'result' | 'diary' | 'replay', value: boolean) => {
    const next = { ...shown, [key]: value };
    setShown(next);
    void act(() => updateGame(g.id, { publish: next }));
  };
  return (
    <div className="game-detail">
      <table className="players">
        <thead>
          <tr>
            <th>Jugador</th>
            <th>Agente</th>
            <th>Enviado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {g.players.map((p) => (
            <tr key={p.id}>
              <td>{p.bot ? <span title="Bot del DM para probar la partida">🤖 {p.display_name}</span> : p.display_name}</td>
              <td>
                <details>
                  <summary>
                    {p.agent.name || '(sin nombre)'}
                    {p.agent.profession ? ` · ${p.agent.profession}` : ''}
                  </summary>
                  <AgentSummary agent={p.agent} />
                </details>
              </td>
              <td>{p.submitted ? '✓' : '…'}</td>
              <td>
                <button
                  className="btn"
                  title="Quitar de la partida"
                  onClick={() => confirm(`¿Quitar a ${p.display_name} de la partida?`) && act(() => editPlayer(g.id, p.id, { remove: true }))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {g.players.length === 0 && (
            <tr>
              <td colSpan={4} className="dim">
                Nadie se ha unido todavía: comparte el enlace.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {(g.status === 'open' || g.status === 'closed') && <BotsRow game={g} act={act} />}
      {g.status === 'intermission' && (
        <div className="day-pause">
          🌙 Fin de la jornada: cada jugador está leyendo su parte y puede cambiar sus órdenes.
          <button className="btn btn-accent" onClick={() => act(() => control('resume'))}>▶ Empezar la siguiente jornada</button>
        </div>
      )}
      <div className="row wrap">
        <button className="btn" onClick={onEdit}>✎ Editar partida</button>
        {g.status === 'open' && <button className="btn" onClick={() => act(() => updateGame(g.id, { status: 'closed' }))}>Cerrar inscripciones</button>}
        {g.status === 'closed' && <button className="btn" onClick={() => act(() => updateGame(g.id, { status: 'open' }))}>Reabrir inscripciones</button>}
        <button
          className="btn btn-accent"
          disabled={g.players.length === 0}
          title={demo ? 'Se lanzará en modo demo (sin LLM)' : 'Se lanzará con el LLM del escenario'}
          onClick={() => act(() => launchGameRun(g.id, demo, speed))}
        >
          ▶ Lanzar{demo ? ' (demo)' : ''}
        </button>
        <button className="btn" onClick={() => confirm(`¿Borrar la partida «${g.title}»?`) && act(() => deleteGame(g.id))}>
          Borrar
        </button>
      </div>
      {(g.status === 'finished' || g.run_id) && (
        <div className="row wrap publish">
          <span className="trait-label">Publicar a los jugadores:</span>
          <label className="toggle">
            <input type="checkbox" checked={shown.result} onChange={(e) => publish('result', e.target.checked)} /> el resultado
          </label>
          <label className="toggle">
            <input type="checkbox" checked={shown.diary} onChange={(e) => publish('diary', e.target.checked)} /> el diario de su agente
          </label>
          <label className="toggle">
            <input type="checkbox" checked={shown.replay} onChange={(e) => publish('replay', e.target.checked)} /> la repetición completa
          </label>
        </div>
      )}
    </div>
  );
}

/** The DM fills empty seats with bots to try the game: random agents within the template. */
function BotsRow({ game: g, act }: { game: Game; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const room = g.max_players - g.players.length;
  const [count, setCount] = useState(Math.min(4, Math.max(1, room)));
  const bots = g.players.filter((p) => p.bot).length;
  return (
    <div className="row wrap" title="Jugadores inventados con una ficha y unas órdenes al azar dentro de lo que permite la partida (repartidos entre los grupos). Nadie los controla.">
      <span>🤖 Bots para probar:</span>
      <input className="input" type="number" min={1} max={Math.max(1, room)} style={{ width: 64 }} value={count} aria-label="Cuántos bots" onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} />
      <button className="btn" disabled={room < 1} onClick={() => act(() => addBots(g.id, Math.min(count, room)))}>
        Añadir
      </button>
      {room < 1 && <span className="dim small">no quedan plazas</span>}
      {bots > 0 && (
        <button className="btn" onClick={() => act(() => removeBots(g.id))}>
          Quitar los {bots} bots
        </button>
      )}
    </div>
  );
}

function AgentSummary({ agent: a }: { agent: Game['players'][number]['agent'] }) {
  const p = (a.personality ?? {}) as Record<string, number>;
  return (
    <dl className="agent-summary small">
      {a.age !== undefined && (<><dt>Edad</dt><dd>{a.age}</dd></>)}
      {Object.keys(p).length > 0 && (<><dt>Personalidad</dt><dd>{Object.entries(p).map(([k, v]) => `${k.slice(0, 4)} ${Number(v).toFixed(2)}`).join(' · ')}</dd></>)}
      {a.goals?.length ? (<><dt>Metas</dt><dd>{a.goals.join(' · ')}</dd></>) : null}
      {a.backstory && (<><dt>Historia</dt><dd>{a.backstory}</dd></>)}
      {a.secrets?.length ? (<><dt>Secretos</dt><dd>{a.secrets.join(' · ')}</dd></>) : null}
      {a.attributes && (<><dt>Atributos</dt><dd>{Object.entries(a.attributes).map(([k, v]) => `${k.slice(0, 3)} ${v}`).join(' · ')} ({pointsSpent(a.attributes)} pts)</dd></>)}
      {a.skills?.length ? (<><dt>Habilidades</dt><dd>{a.skills.map((s) => SKILLS[s] ?? s).join(', ')}</dd></>) : null}
      {a.faction && (<><dt>Grupo</dt><dd>{a.faction}</dd></>)}
      {a.orders && Object.keys(a.orders).length > 0 && (<><dt>Órdenes</dt><dd>{ordersSummary(a.orders)}</dd></>)}
    </dl>
  );
}

function GameForm({ game, scenarios, onSave, onCancel }: { game: Partial<Game>; scenarios: ScenarioRecord[]; onSave: (g: Partial<Game>) => void; onCancel: () => void }) {
  const [g, setG] = useState<Partial<Game>>(game);
  const t = (g.template ?? NEW_TEMPLATE) as Game['template'];
  const setT = (patch: Partial<Game['template']>) => setG({ ...g, template: { ...t, ...patch } });
  const scenario = scenarios.find((s) => s.id === g.scenario_id);
  const places: string[] = ((scenario?.data?.environment?.locations ?? []) as Array<{ name: string }>).map((l) => l.name);
  const scenarioGroups = Object.keys((scenario?.data?.factions ?? {}) as Record<string, unknown>);
  const fixed = t.fixed ?? {};
  const setFixed = (key: string, value: unknown) => {
    const next = { ...fixed };
    if (value === '' || value === undefined || (typeof value === 'object' && value && !Object.keys(value).length)) delete next[key];
    else next[key] = value;
    setT({ fixed: next });
  };
  const items = Object.entries((fixed.resources ?? {}) as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(', ');

  return (
    <form
      className="ed-card game-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(g);
      }}
    >
      <div className="ed-grid">
        <label>
          Escenario
          <select className="select" value={g.scenario_id ?? ''} onChange={(e) => setG({ ...g, scenario_id: e.target.value })}>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.meta.name}</option>
            ))}
          </select>
        </label>
        <label>
          Título para los jugadores
          <input className="input" value={g.title ?? ''} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="La sucesión de Valdemora" />
        </label>
        <label>
          Plazas
          <input className="input" type="number" min={1} max={100} value={g.max_players ?? 6} onChange={(e) => setG({ ...g, max_players: Number(e.target.value) })} />
        </label>
      </div>
      <label>
        Briefing: lo único que sabrán del mundo
        <textarea className="input" rows={4} value={g.briefing ?? ''} onChange={(e) => setG({ ...g, briefing: e.target.value })} placeholder="El conde ha muerto. Llegas al castillo…" />
      </label>
      <fieldset className="traits">
        <legend>Qué puede decidir cada jugador de su agente</legend>
        <div className="row wrap">
          {EDITABLE_FIELDS.map(([k, label]) => (
            <label key={k} className="toggle">
              <input
                type="checkbox"
                checked={t.editable.includes(k)}
                onChange={(e) => setT({ editable: e.target.checked ? [...t.editable, k] : t.editable.filter((x) => x !== k) })}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="ed-grid">
          {t.editable.includes('attributes') && (
            <label>
              Presupuesto de puntos de atributos
              <input className="input" type="number" min={0} max={30} value={t.attribute_budget} onChange={(e) => setT({ attribute_budget: Number(e.target.value) })} />
            </label>
          )}
          {t.editable.includes('skills') && (
            <label>
              Habilidades como máximo
              <input className="input" type="number" min={0} max={10} value={t.max_skills} onChange={(e) => setT({ max_skills: Number(e.target.value) })} />
            </label>
          )}
          {t.editable.includes('faction') && (
            <label>
              Grupos que pueden elegir (vacío = cualquiera del escenario)
              <span className="row wrap">
                {scenarioGroups.map((f) => (
                  <label key={f} className="toggle">
                    <input
                      type="checkbox"
                      checked={(t.factions ?? []).includes(f)}
                      onChange={(e) => setT({ factions: e.target.checked ? [...(t.factions ?? []), f] : (t.factions ?? []).filter((x) => x !== f) })}
                    />
                    {f}
                  </label>
                ))}
                {!scenarioGroups.length && <span className="dim small">El escenario no tiene grupos.</span>}
              </span>
            </label>
          )}
          {t.editable.includes('profession') && (
            <label>
              Profesiones permitidas (separadas por comas; vacío = libre)
              <input
                className="input"
                defaultValue={t.professions.join(', ')}
                onBlur={(e) => setT({ professions: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
              />
            </label>
          )}
        </div>
      </fieldset>
      <fieldset className="traits">
        <legend>Lo que decides tú para todos los agentes de jugador</legend>
        <div className="ed-grid">
          <label>
            Dónde empiezan
            <select className="select" value={String(fixed.starting_location ?? '')} onChange={(e) => setFixed('starting_location', e.target.value)}>
              <option value="">(el primer lugar)</option>
              {places.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Qué llevan (objeto: cantidad, separados por comas)
            <input
              className="input"
              defaultValue={items}
              placeholder="comida: 2, oro: 5"
              onBlur={(e) =>
                setFixed(
                  'resources',
                  Object.fromEntries(
                    e.target.value
                      .split(',')
                      .map((x) => x.split(':').map((y) => y.trim()))
                      .filter(([k, v]) => k && Number(v) > 0)
                      .map(([k, v]) => [k, Number(v)]),
                  ),
                )
              }
            />
          </label>
          <label>
            Grupo
            <input className="input" defaultValue={String(fixed.faction ?? '')} placeholder="(ninguno)" onBlur={(e) => setFixed('faction', e.target.value.trim())} />
          </label>
        </div>
      </fieldset>
      <div className="row">
        <button className="btn btn-accent" type="submit" disabled={!g.scenario_id}>Guardar partida</button>
        <button className="btn" type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
