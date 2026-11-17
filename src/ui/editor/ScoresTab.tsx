import { useState } from 'react';
import { BUILTIN_ACTIONS, type Achievement, type AchievementWhen } from '../../api/scenario';
import { ChipPicker } from './ChipPicker';
import { useDraft } from './draft';
import { prune } from './RulesWidgets';

type Kind = 'action' | 'visited' | 'carries' | 'condition' | 'alive_at_end' | 'without';

const KINDS: Array<[Kind, string]> = [
  ['action', 'Hacer una acción'],
  ['visited', 'Visitar lugares'],
  ['carries', 'Llevar un objeto'],
  ['condition', 'Tener un estado'],
  ['alive_at_end', 'Seguir vivo al final'],
  ['without', 'Pasar tiempo sin hacer algo (penaliza)'],
];

function kindOf(w: AchievementWhen): Kind {
  if (w.without) return 'without';
  if (w.visited !== undefined) return 'visited';
  if (w.carries) return 'carries';
  if (w.condition) return 'condition';
  if (w.alive_at_end) return 'alive_at_end';
  return 'action';
}

/** Points and achievements: what earns or loses points; agents see them and go for them. */
export function ScoresTab() {
  const [draft, update] = useDraft();
  const [name, setName] = useState('');
  const achievements = draft.scores?.achievements ?? {};
  const places = draft.environment.locations.map((l) => l.name);
  const actions = [...Object.keys(draft.actions ?? {}), ...BUILTIN_ACTIONS.filter((a) => !['wait', 'custom', 'accept', 'decline'].includes(a))];
  const set = (key: string, fn: (a: Achievement) => void) =>
    update((d) => {
      const a = (((d.scores ??= {}).achievements ??= {})[key] ??= { when: { action: 'move' } });
      fn(a);
    });
  const setKind = (key: string, kind: Kind) =>
    set(key, (a) => {
      a.when = kind === 'action' ? { action: actions[0] ?? 'move' } : kind === 'visited' ? { visited: 'all' } : kind === 'carries' ? { carries: Object.keys(draft.items ?? {})[0] ?? '' } : kind === 'condition' ? { condition: Object.keys(draft.conditions ?? {})[0] ?? '' } : kind === 'alive_at_end' ? { alive_at_end: true } : { without: 'work', every: 24 };
      if (kind === 'without' && (a.points ?? 1) > 0) a.points = -1;
    });

  return (
    <div className="ed-section">
      <h3>Logros ({Object.keys(achievements).length})</h3>
      <p className="dim small">
        Puntos por hacer cosas (visitar todos los lugares, curar a tres personas, cada reparación…) o en contra por no hacerlas. Los agentes ven su
        puntuación, el marcador y qué da puntos, y van a por ellos. Una regla puede terminar la partida al llegar a unos puntos y nombrar al
        ganador con {'{winner}'}.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={draft.scores?.visible !== false}
          onChange={(e) => update((d) => void ((d.scores ??= {}).visible = e.target.checked ? undefined : false))}
        />
        Los agentes ven los puntos (si no, solo sirven al DM para evaluar)
      </label>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().toLowerCase().replace(/\s+/g, '_');
          if (n) set(n, (a) => void (a.description ??= name.trim()));
          setName('');
        }}
      >
        <input className="input grow" placeholder="Nombre del logro (explorador, curandero…)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">+ Logro</button>
      </form>
      {Object.entries(achievements).map(([key, a]) => {
        const kind = kindOf(a.when ?? {});
        const w = a.when ?? {};
        return (
          <article key={key} className="ed-card">
            <div className="row">
              <strong className="grow">{key}</strong>
              <label className="row nowrap">
                Puntos
                <input className="input" type="number" style={{ width: 70 }} value={a.points ?? 1} onChange={(e) => set(key, (x) => void (x.points = Number(e.target.value)))} />
              </label>
              <button
                className="btn"
                title="Eliminar logro"
                onClick={() =>
                  update((d) => {
                    delete d.scores!.achievements![key];
                    if (!Object.keys(d.scores!.achievements!).length) delete d.scores;
                  })
                }
              >
                ✕
              </button>
            </div>
            <input className="input" placeholder="Lo que leen los agentes («Visitar todos los lugares»)" value={a.description ?? ''} onChange={(e) => set(key, (x) => void (x.description = e.target.value))} />
            <div className="row wrap">
              <select className="select" value={kind} onChange={(e) => setKind(key, e.target.value as Kind)}>
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {(kind === 'action' || kind === 'without') && (
                <select
                  className="select"
                  value={kind === 'action' ? w.action : w.without}
                  onChange={(e) => set(key, (x) => void (kind === 'action' ? (x.when.action = e.target.value) : (x.when.without = e.target.value)))}
                >
                  {actions.map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              {kind === 'action' && (
                <label className="row nowrap">
                  veces
                  <input className="input" type="number" min={1} style={{ width: 60 }} value={w.times ?? 1} onChange={(e) => set(key, (x) => void (x.when = prune({ ...x.when, times: Number(e.target.value) > 1 ? Number(e.target.value) : undefined }) as AchievementWhen))} />
                </label>
              )}
              {kind === 'visited' && (
                <>
                  <label className="toggle">
                    <input type="checkbox" checked={w.visited === 'all'} onChange={(e) => set(key, (x) => void (x.when.visited = e.target.checked ? 'all' : []))} />
                    todos
                  </label>
                  {w.visited !== 'all' && <ChipPicker options={places} value={w.visited as string[]} placeholder="+ lugar" onChange={(v) => set(key, (x) => void (x.when.visited = v))} />}
                </>
              )}
              {kind === 'carries' && (
                <select className="select" value={w.carries} onChange={(e) => set(key, (x) => void (x.when.carries = e.target.value))}>
                  {Object.keys(draft.items ?? {}).map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              {kind === 'condition' && (
                <select className="select" value={w.condition} onChange={(e) => set(key, (x) => void (x.when.condition = e.target.value))}>
                  {Object.keys(draft.conditions ?? {}).map((n) => <option key={n}>{n}</option>)}
                </select>
              )}
              {(kind === 'without' || ((kind === 'carries' || kind === 'condition') && a.repeat)) && (
                <label className="row nowrap">
                  cada
                  <input className="input" type="number" min={1} style={{ width: 60 }} value={w.every ?? 24} onChange={(e) => set(key, (x) => void (x.when.every = Number(e.target.value)))} />
                  ticks
                </label>
              )}
              {kind !== 'alive_at_end' && kind !== 'without' && kind !== 'visited' && (
                <label className="toggle" title="Se gana otra vez cada vez que vuelve a pasar">
                  <input type="checkbox" checked={!!a.repeat} onChange={(e) => set(key, (x) => void (e.target.checked ? (x.repeat = true) : delete x.repeat))} />
                  Se repite
                </label>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
