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
                    <input className="input" value={a.name} onChange={(e) => set((x) => void (x.name = e.target.value))} />
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
