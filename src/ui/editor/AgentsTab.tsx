import { useState } from 'react';
import { DEFAULT_PERSONALITY, uniqueName, type AgentConfig, type PersonalityConfig } from '../../api/scenario';
import { archetypeFor } from '../../game/art/archetypes';
import type { ThemePack } from '../../themes/types';
import { Portrait } from '../Portrait';
import { AmountsField } from './AmountsField';
import { ChipPicker } from './ChipPicker';
import { useDraft } from './draft';

const TRAITS: Array<[keyof PersonalityConfig, string]> = [
  ['openness', 'Apertura'],
  ['conscientiousness', 'Responsabilidad'],
  ['extraversion', 'Extraversión'],
  ['agreeableness', 'Amabilidad'],
  ['neuroticism', 'Neuroticismo'],
];

const ARCHETYPE_LABEL: Record<string, string> = {
  pilot: 'piloto',
  medic: 'sanitario',
  scientist: 'científico',
  cook: 'cocinero',
  farmer: 'granjero',
  engineer: 'ingeniero',
  worker: 'operario',
  security: 'seguridad',
  officer: 'oficial',
  executive: 'directivo',
  clergy: 'religioso',
  teacher: 'docente',
  student: 'estudiante',
  merchant: 'comerciante',
};

export function AgentsTab({ theme }: { theme: ThemePack }) {
  const [draft, update] = useDraft();
  const [open, setOpen] = useState<number | null>(0);
  const places = draft.environment.locations.map((l) => l.name).filter(Boolean);

  const add = (base?: AgentConfig) =>
    update((d) => {
      d.agents.push(
        base
          ? { ...structuredClone(base), name: uniqueName(base.name, d.agents.map((a) => a.name)) }
          : {
              name: uniqueName('Agente', d.agents.map((a) => a.name)),
              age: 30,
              profession: '',
              personality: { ...DEFAULT_PERSONALITY },
              goals: [''],
              starting_location: places[0] ?? '',
              resources: {},
              backstory: '',
            },
      );
      setOpen(d.agents.length - 1);
    });

  return (
    <div className="ed-section">
      <div className="row between">
        <h3>Agentes ({draft.agents.length})</h3>
        <button className="btn" onClick={() => add()}>+ Agente</button>
      </div>
      {draft.agents.map((a, i) => {
        const set = (fn: (x: AgentConfig) => void) => update((d) => fn(d.agents[i]));
        const arch = archetypeFor(a.profession);
        const isOpen = open === i;
        return (
          <article key={i} className={`ed-card ${isOpen ? 'on' : ''}`}>
            <header className="row" onClick={() => setOpen(isOpen ? null : i)}>
              <Portrait theme={theme} name={a.name} profession={a.profession} scale={2} />
              <span className="grow">
                <strong>{a.name || 'Sin nombre'}</strong>
                <span className="dim"> · {a.profession || 'sin profesión'}{a.starting_location ? ` · ${a.starting_location}` : ''}{a.arrives_at ? ` · llega en t${a.arrives_at}` : ''}</span>
              </span>
              <button className="btn" title="Duplicar" onClick={(e) => { e.stopPropagation(); add(a); }}>⧉</button>
              <button
                className="btn"
                title="Eliminar agente"
                onClick={(e) => {
                  e.stopPropagation();
                  update((d) => void d.agents.splice(i, 1));
                  setOpen(null);
                }}
              >
                ✕
              </button>
            </header>
            {isOpen && (
              <div className="ed-agent">
                <div className="ed-grid">
                  <label>
                    Nombre
                    <input
                      className="input"
                      value={a.name}
                      onChange={(e) =>
                        update((d) => {
                          const old = d.agents[i].name;
                          d.agents[i].name = e.target.value;
                          // keep the others' relationships pointing at the renamed agent
                          for (const other of d.agents) {
                            const rel = other.relationships?.[old];
                            if (rel && old !== e.target.value) {
                              other.relationships![e.target.value] = rel;
                              delete other.relationships![old];
                            }
                          }
                        })
                      }
                    />
                  </label>
                  <label>
                    Edad
                    <input className="input" type="number" min={0} value={a.age ?? 30} onChange={(e) => set((x) => void (x.age = Number(e.target.value) || 0))} />
                  </label>
                  <label>
                    Profesión
                    <input className="input" value={a.profession ?? ''} placeholder="médica, piloto, mecánico…" onChange={(e) => set((x) => void (x.profession = e.target.value))} />
                    <span className="dim small">{arch ? `Aspecto: ${ARCHETYPE_LABEL[arch.id] ?? arch.id}` : 'Aspecto: según el tema'}</span>
                  </label>
                  <label>
                    Salud inicial
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={a.health ?? 1}
                      onChange={(e) => set((x) => void (Number(e.target.value) >= 1 ? delete x.health : (x.health = Number(e.target.value))))}
                    />
                    <span className="dim small">{Math.round((a.health ?? 1) * 100)}%</span>
                  </label>
                  <label>
                    Llega en el tick
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={a.arrives_at ?? 0}
                      onChange={(e) => set((x) => void (Number(e.target.value) > 0 ? (x.arrives_at = Number(e.target.value)) : delete x.arrives_at))}
                    />
                    <span className="dim small">0 = desde el principio</span>
                  </label>
                  <label>
                    Empieza en
                    <select className="select" value={a.starting_location ?? ''} onChange={(e) => set((x) => void (x.starting_location = e.target.value))}>
                      <option value="">(el primer lugar)</option>
                      {places.map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </label>
                </div>
                <fieldset className="traits">
                  <legend>Personalidad (OCEAN)</legend>
                  {TRAITS.map(([k, label]) => (
                    <label key={k} className="trait">
                      <span>{label}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={a.personality?.[k] ?? 0.5}
                        onChange={(e) => set((x) => void ((x.personality ??= {})[k] = Number(e.target.value)))}
                      />
                      <span className="dim">{(a.personality?.[k] ?? 0.5).toFixed(2)}</span>
                    </label>
                  ))}
                </fieldset>
                <label>
                  Objetivos (uno por línea)
                  <textarea className="input" rows={3} value={(a.goals ?? []).join('\n')} onChange={(e) => set((x) => void (x.goals = e.target.value.split('\n')))} />
                </label>
                <label>
                  Historia
                  <textarea className="input" rows={3} value={a.backstory ?? ''} onChange={(e) => set((x) => void (x.backstory = e.target.value))} />
                </label>
                {Object.keys(draft.needs ?? {}).length > 0 && (
                  <div className="fx-row">
                    <span className="fx-label">Necesidades al empezar</span>
                    <div className="fx-items">
                      {Object.entries(draft.needs ?? {}).map(([k, n]) => (
                        <span key={k} className="row">
                          <span className="trait-label">{n.label || k}</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={a.needs?.[k] ?? 0}
                            onChange={(e) =>
                              set((x) => {
                                const v = Number(e.target.value);
                                const needs = { ...x.needs, [k]: v };
                                if (!v) delete needs[k];
                                if (Object.keys(needs).length) x.needs = needs;
                                else delete x.needs;
                              })
                            }
                          />
                          <span className="dim">{Math.round((a.needs?.[k] ?? 0) * 100)}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(draft.conditions ?? {}).length > 0 && (
                  <label>
                    <span>Empieza con estos estados</span>
                    <ChipPicker options={Object.keys(draft.conditions ?? {})} value={a.conditions} onChange={(v) => set((x) => void (v.length ? (x.conditions = v) : delete x.conditions))} />
                  </label>
                )}
                <MindFields agent={a} others={draft.agents.map((o) => o.name).filter((n) => n && n !== a.name)} set={set} />
                <AmountsField
                  label={<>Inventario (<code>objeto: cantidad</code>; se ven en el mapa y los agentes pueden darlos, usarlos o intercambiarlos)</>}
                  value={a.resources}
                  onChange={(r) => set((x) => void (x.resources = r))}
                />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

const REL_TYPES = ['hermano', 'hermana', 'madre', 'padre', 'hijo', 'hija', 'pareja', 'amigo', 'amiga', 'rival', 'jefe', 'empleado', 'vecino'];

/** Typed relationships, beliefs (with their ground truth) and secrets. */
function MindFields({ agent: a, others, set }: { agent: AgentConfig; others: string[]; set: (fn: (x: AgentConfig) => void) => void }) {
  const rels = Object.entries(a.relationships ?? {});
  const beliefs = (a.beliefs ?? []).map((b) => (typeof b === 'string' ? { text: b, true: null as boolean | null } : { text: b.text, true: b.true ?? null }));
  const free = others.filter((o) => !(o in (a.relationships ?? {})));
  const setBeliefs = (list: Array<{ text: string; true: boolean | null }>) =>
    set((x) => void (list.length ? (x.beliefs = list.map((b) => (b.true === null ? b.text : { text: b.text, true: b.true }))) : delete x.beliefs));
  return (
    <details className="mind-fields">
      <summary>Relaciones, creencias y secretos{rels.length + beliefs.length + (a.secrets?.length ?? 0) ? ` (${rels.length + beliefs.length + (a.secrets?.length ?? 0)})` : ''}</summary>
      <div className="fx-row">
        <span className="fx-label">Relaciones</span>
        <div className="fx-items">
          {rels.map(([name, r]) => (
            <span key={name} className="row wrap">
              <strong>{name}</strong>
              <input
                className="input"
                list="rel-types"
                placeholder="hermano, pareja, rival…"
                value={r.type ?? ''}
                onChange={(e) => set((x) => void (x.relationships![name] = { ...x.relationships![name], type: e.target.value }))}
              />
              <input
                type="range"
                min={-1}
                max={1}
                step={0.1}
                value={r.sentiment ?? 0}
                title="Cómo se llevan"
                onChange={(e) => set((x) => void (x.relationships![name] = { ...x.relationships![name], sentiment: Number(e.target.value) }))}
              />
              <span className={(r.sentiment ?? 0) < 0 ? 'bad-text' : 'ok-text'}>{(r.sentiment ?? 0).toFixed(1)}</span>
              <button
                className="btn"
                onClick={() =>
                  set((x) => {
                    delete x.relationships![name];
                    if (!Object.keys(x.relationships!).length) delete x.relationships;
                  })
                }
              >
                ✕
              </button>
            </span>
          ))}
          {free.length > 0 && (
            <select className="select" value="" onChange={(e) => e.target.value && set((x) => void ((x.relationships ??= {})[e.target.value] = { type: '', sentiment: 0.5 }))}>
              <option value="">+ relación con…</option>
              {free.map((o) => <option key={o}>{o}</option>)}
            </select>
          )}
          <datalist id="rel-types">{REL_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <span className="dim small">La familia y la pareja sufren mucho su muerte (aunque estén lejos) y se ponen contra quien les haga daño.</span>
        </div>
      </div>
      <div className="fx-row">
        <span className="fx-label">Cree que…</span>
        <div className="fx-items">
          {beliefs.map((b, j) => (
            <span key={j} className="row">
              <input className="input grow" value={b.text} onChange={(e) => setBeliefs(beliefs.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)))} />
              <select
                className="select"
                value={b.true === null ? '' : String(b.true)}
                title="¿Es verdad? (el agente no lo sabe)"
                onChange={(e) => setBeliefs(beliefs.map((x, k) => (k === j ? { ...x, true: e.target.value === '' ? null : e.target.value === 'true' } : x)))}
              >
                <option value="">¿?</option>
                <option value="true">cierto</option>
                <option value="false">falso</option>
              </select>
              <button className="btn" onClick={() => setBeliefs(beliefs.filter((_, k) => k !== j))}>✕</button>
            </span>
          ))}
          <button className="btn" onClick={() => setBeliefs([...beliefs, { text: 'Algo que cree', true: null }])}>+ Creencia</button>
        </div>
      </div>
      <div className="fx-row">
        <span className="fx-label">Secretos</span>
        <div className="fx-items">
          {(a.secrets ?? []).map((s, j) => (
            <span key={j} className="row">
              <input className="input grow" value={s} onChange={(e) => set((x) => void (x.secrets![j] = e.target.value))} />
              <button
                className="btn"
                onClick={() =>
                  set((x) => {
                    x.secrets!.splice(j, 1);
                    if (!x.secrets!.length) delete x.secrets;
                  })
                }
              >
                ✕
              </button>
            </span>
          ))}
          <button className="btn" onClick={() => set((x) => void (x.secrets ??= []).push('Algo que nadie sabe'))}>+ Secreto</button>
        </div>
      </div>
    </details>
  );
}
