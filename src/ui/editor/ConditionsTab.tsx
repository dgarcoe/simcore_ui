import { useState } from 'react';
import type { ConditionConfig } from '../../api/scenario';
import { useDraft } from './draft';
import { prune, RequirementEditor, StatSliders } from './RulesWidgets';

/** Scenario conditions: infected, zombie, panicked… what they do and how they spread. */
export function ConditionsTab() {
  const [draft, update] = useDraft();
  const [name, setName] = useState('');
  const conds = draft.conditions ?? {};
  const names = Object.keys(conds);
  const actions = Object.keys(draft.actions ?? {});
  const set = (key: string, fn: (c: ConditionConfig) => void) =>
    update((d) => {
      const c = ((d.conditions ??= {})[key] ??= {});
      fn(c);
      d.conditions[key] = prune(c);
    });
  const rename = (from: string, to: string) =>
    update((d) => {
      if (!to || to === from || d.conditions?.[to]) return;
      const entries = Object.entries(d.conditions ?? {}).map(([k, v]) => [k === from ? to : k, v] as const);
      d.conditions = Object.fromEntries(entries);
      const swap = (l?: string[]) => l?.map((x) => (x === from ? to : x));
      d.agents.forEach((a) => (a.conditions = swap(a.conditions)));
      Object.values(d.conditions).forEach((c) => c.becomes === from && (c.becomes = to));
    });

  return (
    <div className="ed-section">
      <h3>Estados ({names.length})</h3>
      <p className="dim small">
        Estados en los que puede estar un agente: infectado, herido, en pánico, zombi… Pueden afectar cada tick, durar un tiempo y
        convertirse en otro, contagiarse, y hacer que un agente lo controlen reglas en vez del LLM (zombis, animales, multitudes: no
        gastan llamadas al LLM).
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (n) update((d) => void ((d.conditions ??= {})[n] ??= { description: '' }));
          setName('');
        }}
      >
        <input className="input grow" placeholder="Nombre del estado (infected, zombie, panicked…)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">+ Estado</button>
      </form>
      {Object.entries(conds).map(([key, c]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <input type="color" value={c.color || '#94b0c2'} title="Color en el mapa" onChange={(e) => set(key, (x) => void (x.color = e.target.value))} />
            <input className="input grow" defaultValue={key} onBlur={(e) => rename(key, e.target.value.trim())} />
            <button
              className="btn"
              title="Eliminar estado"
              onClick={() =>
                update((d) => {
                  delete d.conditions![key];
                  if (!Object.keys(d.conditions!).length) delete d.conditions;
                })
              }
            >
              ✕
            </button>
          </div>
          <input className="input" placeholder="Qué siente el agente (lo lee él)" value={c.description ?? ''} onChange={(e) => set(key, (x) => void (x.description = e.target.value))} />
          <input className="input" placeholder="Qué ven los demás (vacío: no se nota)" value={c.appearance ?? ''} onChange={(e) => set(key, (x) => void (x.appearance = e.target.value))} />
          <div className="ed-grid">
            <label>
              Dura (ticks)
              <input
                className="input"
                type="number"
                min={0}
                placeholder="indefinido"
                value={c.duration ?? ''}
                onChange={(e) => set(key, (x) => void (Number(e.target.value) > 0 ? (x.duration = Number(e.target.value)) : delete x.duration))}
              />
            </label>
            <label>
              Al acabar se convierte en
              <select className="select" value={c.becomes ?? ''} onChange={(e) => set(key, (x) => void (x.becomes = e.target.value))}>
                <option value="">(desaparece)</option>
                {names.filter((n) => n !== key).map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label>
              Contagio
              <select
                className="select"
                value={c.contagion?.via ?? ''}
                onChange={(e) => set(key, (x) => void (e.target.value ? (x.contagion = { chance: x.contagion?.chance ?? 0.2, via: e.target.value as 'interaction' | 'place' }) : delete x.contagion))}
              >
                <option value="">No se contagia</option>
                <option value="interaction">Al tratar con alguien</option>
                <option value="place">Por estar en el mismo sitio</option>
              </select>
            </label>
            {c.contagion && (
              <label>
                Probabilidad de contagio: {Math.round((c.contagion.chance ?? 0.2) * 100)}%
                <input type="range" min={0.01} max={1} step={0.01} value={c.contagion.chance ?? 0.2} onChange={(e) => set(key, (x) => void (x.contagion = { ...x.contagion, chance: Number(e.target.value) }))} />
              </label>
            )}
          </div>
          <div className="fx-row">
            <span className="fx-label">Cada tick</span>
            <StatSliders value={c.per_tick} onChange={(v) => set(key, (x) => void (x.per_tick = v))} />
          </div>
          <label className="toggle">
            <input type="checkbox" checked={c.controller === 'rules'} onChange={(e) => set(key, (x) => void (x.controller = e.target.checked ? 'rules' : undefined))} />
            Lo controlan reglas, no el LLM
          </label>
          {c.controller === 'rules' && (
            <div className="fx-row">
              <span className="fx-label">Reglas</span>
              <div className="fx-items">
                <label className="row">
                  <span className="trait-label">Acción sobre otros</span>
                  <select className="select" value={c.rules?.action ?? ''} onChange={(e) => set(key, (x) => void (x.rules = prune({ ...x.rules, action: e.target.value })))}>
                    <option value="">(ninguna)</option>
                    {actions.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </label>
                <label className="toggle">
                  <input type="checkbox" checked={c.rules?.seek ?? true} onChange={(e) => set(key, (x) => void (x.rules = { ...x.rules, seek: e.target.checked }))} /> Busca a sus objetivos
                </label>
                <label className="row">
                  <span className="trait-label">Deambula</span>
                  <input type="range" min={0} max={1} step={0.05} value={c.rules?.wander ?? 0.3} onChange={(e) => set(key, (x) => void (x.rules = { ...x.rules, wander: Number(e.target.value) }))} />
                  <span className="dim">{Math.round((c.rules?.wander ?? 0.3) * 100)}%</span>
                </label>
                <details>
                  <summary className="small">Objetivos (por defecto: quien no tenga este estado)</summary>
                  <RequirementEditor conditions={names} value={c.rules?.targets} withItems={false} onChange={(r) => set(key, (x) => void (x.rules = prune({ ...x.rules, targets: r })))} />
                </details>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
