import { useState } from 'react';
import { DAY_PHASES, itemsUsed, type DayPhase, type FactionConfig, type VoteConfig } from '../../api/scenario';
import { ChipPicker } from './ChipPicker';
import { useDraft } from './draft';
import { EffectsEditor } from './EffectsEditor';
import { prune } from './RulesWidgets';

const ROUTINE_ACTIONS = ['rest', 'work', 'observe', 'speak'];
const DEFAULT_HEALERS = ['médic', 'medic', 'enfermer', 'nurse', 'sanitari', 'veterinari', 'doctor', 'paramedic'];

/** Groups (configured or founded by the agents), matters to vote on, daily routines and who can heal. */
export function SocietyTab() {
  const [draft, update] = useDraft();
  const [groupName, setGroupName] = useState('');
  const [voteKey, setVoteKey] = useState('');
  const [routineWho, setRoutineWho] = useState('');
  const agents = draft.agents.map((a) => a.name).filter(Boolean);
  const places = draft.environment.locations.map((l) => l.name).filter(Boolean);
  const conditions = Object.keys(draft.conditions ?? {});
  const items = [...new Set([...Object.keys(draft.items ?? {}), ...itemsUsed(draft)])].sort();
  const needs = Object.keys(draft.needs ?? {});
  const factions = draft.factions ?? {};
  const votes = draft.votes ?? {};
  const routines = draft.routines ?? {};
  const society = draft.society ?? {};
  const professions = [...new Set(draft.agents.map((a) => a.profession ?? '').filter(Boolean))];

  const setFaction = (key: string, fn: (f: FactionConfig) => void) =>
    update((d) => {
      const f = ((d.factions ??= {})[key] ??= {});
      fn(f);
      d.factions[key] = prune(f);
    });
  const setVote = (key: string, fn: (v: VoteConfig) => void) =>
    update((d) => {
      const v = (d.votes ??= {})[key];
      fn(v);
    });
  const setRoutine = (who: string, phase: DayPhase, action: string, where: string[] | null) =>
    update((d) => {
      const r = ((d.routines ??= {})[who] ??= {});
      const todo = (r[phase] ??= {});
      if (where === null) delete todo[action];
      else todo[action] = where;
      if (!Object.keys(todo).length) delete r[phase];
      if (!Object.keys(r).length) delete d.routines![who];
      if (!Object.keys(d.routines!).length) delete d.routines;
    });

  return (
    <div className="ed-section">
      <h3>Grupos ({Object.keys(factions).length})</h3>
      <p className="dim small">
        Grupos con una meta común y un líder. Puedes crear algunos desde el principio; los agentes también pueden fundar los suyos,
        unirse, irse o expulsar a alguien. Si el líder muere o se va, el grupo elige otro.
      </p>
      <label className="toggle">
        <input
          type="checkbox"
          checked={society.spontaneous_groups !== false}
          onChange={(e) =>
            update((d) => {
              const s = (d.society ??= {});
              if (e.target.checked) delete s.spontaneous_groups;
              else s.spontaneous_groups = false;
              if (!Object.keys(s).length) delete d.society;
            })
          }
        />
        Los agentes pueden fundar grupos por su cuenta
      </label>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = groupName.trim();
          if (n) update((d) => void ((d.factions ??= {})[n] ??= { goal: '', members: [] }));
          setGroupName('');
        }}
      >
        <input className="input grow" placeholder="Nombre del grupo (la Guardia, los del molino…)" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
        <button className="btn" type="submit">+ Grupo</button>
      </form>
      {Object.entries(factions).map(([key, f]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <input type="color" value={f.color || '#41a6f6'} title="Color del grupo" onChange={(e) => setFaction(key, (x) => void (x.color = e.target.value))} />
            <strong>{key}</strong>
            <input className="input grow" placeholder="Meta del grupo" value={f.goal ?? ''} onChange={(e) => setFaction(key, (x) => void (x.goal = e.target.value))} />
            <button
              className="btn"
              title="Eliminar grupo"
              onClick={() =>
                update((d) => {
                  delete d.factions![key];
                  if (!Object.keys(d.factions!).length) delete d.factions;
                })
              }
            >
              ✕
            </button>
          </div>
          <span className="row wrap">
            <span className="trait-label">Miembros</span>
            <ChipPicker options={agents} value={f.members} onChange={(v) => setFaction(key, (x) => void (x.members = v))} />
          </span>
          <label className="row">
            <span className="trait-label">Líder</span>
            <select className="select" value={f.leader ?? ''} onChange={(e) => setFaction(key, (x) => void (x.leader = e.target.value || undefined))}>
              <option value="">(el primero de la lista)</option>
              {(f.members ?? []).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <span className="row wrap">
            <span className="trait-label">Rivales</span>
            <ChipPicker options={Object.keys(factions).filter((k) => k !== key)} value={f.rivals} onChange={(v) => setFaction(key, (x) => void (x.rivals = v))} />
          </span>
        </article>
      ))}

      <h3>Votaciones ({Object.keys(votes).length})</h3>
      <p className="dim small">
        Asuntos que los agentes pueden someter a votación en un lugar («call_vote»); votan los presentes. Cada resultado puede tener
        consecuencias. Además pueden votar cualquier cosa que se les ocurra (sin consecuencias).
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const k = voteKey.trim();
          if (k) update((d) => void ((d.votes ??= {})[k] ??= { question: '', options: { sí: {}, no: {} } }));
          setVoteKey('');
        }}
      >
        <input className="input grow" placeholder="Identificador (soldado, cerrar_iglesia…)" value={voteKey} onChange={(e) => setVoteKey(e.target.value)} />
        <button className="btn" type="submit">+ Votación</button>
      </form>
      {Object.entries(votes).map(([key, v]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <strong>{key}</strong>
            <input className="input grow" placeholder="Pregunta (¿Dejamos entrar al forastero?)" value={v.question} onChange={(e) => setVote(key, (x) => void (x.question = e.target.value))} />
            <button
              className="btn"
              title="Eliminar votación"
              onClick={() =>
                update((d) => {
                  delete d.votes![key];
                  if (!Object.keys(d.votes!).length) delete d.votes;
                })
              }
            >
              ✕
            </button>
          </div>
          <div className="ed-grid">
            <label>
              Desde el tick
              <input className="input" type="number" min={0} value={v.from ?? 0} onChange={(e) => setVote(key, (x) => void (Number(e.target.value) > 0 ? (x.from = Number(e.target.value)) : delete x.from))} />
            </label>
            <label>
              Abierta (ticks)
              <input className="input" type="number" min={1} value={v.duration ?? 2} onChange={(e) => setVote(key, (x) => void (x.duration = Math.max(1, Number(e.target.value) || 2)))} />
            </label>
            <label className="toggle">
              <input type="checkbox" checked={v.once !== false} onChange={(e) => setVote(key, (x) => void (e.target.checked ? delete x.once : (x.once = false)))} />
              Se decide una sola vez
            </label>
          </div>
          {Object.entries(v.options ?? {}).map(([option, fx]) => (
            <details key={option} className="fx-row" open={Object.keys(fx ?? {}).length > 0}>
              <summary className="row">
                <span className="fx-label">Si gana «{option}»</span>
                <button
                  className="btn"
                  title="Quitar opción"
                  onClick={(e) => {
                    e.preventDefault();
                    setVote(key, (x) => void delete x.options![option]);
                  }}
                >
                  ✕
                </button>
              </summary>
              <EffectsEditor
                effects={fx}
                agents={agents}
                places={places}
                items={items}
                conditions={conditions}
                needs={needs}
                onChange={(next) => setVote(key, (x) => void ((x.options ??= {})[option] = next ?? {}))}
              />
            </details>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.currentTarget.elements.namedItem('opt') as HTMLInputElement);
              const o = input.value.trim();
              if (o) setVote(key, (x) => void ((x.options ??= {})[o] ??= {}));
              input.value = '';
            }}
          >
            <input name="opt" className="input grow" placeholder="Otra opción (esperar, quemarlo…)" />
            <button className="btn" type="submit">+ Opción</button>
          </form>
        </article>
      ))}

      <h3>Rutinas</h3>
      <p className="dim small">
        Lo que suele hacer cada uno según la hora (noche 22–6, mañana 6–12, día 12–19, tarde 19–22). Por agente, por profesión (vale
        parte de la palabra) o «*» para todos. Sin rutinas, los agentes solo saben qué hora es.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const w = routineWho.trim();
          if (w) update((d) => void ((d.routines ??= {})[w] ??= { night: { rest: [] } }));
          setRoutineWho('');
        }}
      >
        <input className="input grow" list="routine-who" placeholder="Quién: un agente, una profesión o *" value={routineWho} onChange={(e) => setRoutineWho(e.target.value)} />
        <datalist id="routine-who">
          {['*', ...agents, ...professions].map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
        <button className="btn" type="submit">+ Rutina</button>
      </form>
      {Object.entries(routines).map(([who, phases]) => (
        <article key={who} className="ed-card">
          <div className="row">
            <strong>{who === '*' ? 'Todos (*)' : who}</strong>
            <span className="grow" />
            <button
              className="btn"
              title="Eliminar rutina"
              onClick={() =>
                update((d) => {
                  delete d.routines![who];
                  if (!Object.keys(d.routines!).length) delete d.routines;
                })
              }
            >
              ✕
            </button>
          </div>
          {DAY_PHASES.map(([phase, label]) => {
            const todo = phases?.[phase] ?? {};
            return (
              <div key={phase} className="fx-row">
                <span className="fx-label">{label}</span>
                <div className="fx-items">
                  {Object.entries(todo).map(([action, where]) => (
                    <span key={action} className="row wrap">
                      <span className="trait-label">{action}</span>
                      <ChipPicker options={places} value={where} placeholder="+ lugar" onChange={(v) => setRoutine(who, phase, action, v)} />
                      <button className="btn" title="Quitar" onClick={() => setRoutine(who, phase, action, null)}>✕</button>
                    </span>
                  ))}
                  <select className="select" value="" onChange={(e) => e.target.value && setRoutine(who, phase, e.target.value, [])}>
                    <option value="">+ qué hace…</option>
                    {[...ROUTINE_ACTIONS, ...Object.keys(draft.actions ?? {})].filter((a) => !(a in todo)).map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </article>
      ))}

      <h3>Atacar y curar</h3>
      <p className="dim small">
        Cualquier agente puede atacar («attack»): con su mejor arma (objetos con «Arma» en la pestaña Objetos) o a puñetazos. Cura
        («heal») con un objeto curativo; sin objeto, solo quien tenga una de estas profesiones.
      </p>
      <label>
        Profesiones que saben curar (vale parte de la palabra, separadas por comas)
        <input
          className="input"
          defaultValue={(society.healers ?? DEFAULT_HEALERS).join(', ')}
          onBlur={(e) =>
            update((d) => {
              const list = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
              const s = (d.society ??= {});
              if (list.join() === DEFAULT_HEALERS.join()) delete s.healers;
              else s.healers = list;
              if (!Object.keys(s).length) delete d.society;
            })
          }
        />
      </label>
    </div>
  );
}
