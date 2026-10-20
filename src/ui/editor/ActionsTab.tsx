import { useState } from 'react';
import { BUILTIN_ACTIONS, type ActionConfig, type CheckConfig } from '../../api/scenario';
import { ATTRIBUTES, SKILLS } from '../../store/rpg';
import { AmountsField } from './AmountsField';
import { useDraft } from './draft';
import { OutcomeEditor, prune, RequirementEditor } from './RulesWidgets';

/** Scenario-specific actions (bite, shoot, treat, barricade…) that the engine resolves. */
export function ActionsTab() {
  const [draft, update] = useDraft();
  const [name, setName] = useState('');
  const acts = draft.actions ?? {};
  const conditions = Object.keys(draft.conditions ?? {});
  const set = (key: string, fn: (a: ActionConfig) => void) =>
    update((d) => {
      const a = ((d.actions ??= {})[key] ??= {});
      fn(a);
      d.actions[key] = prune(a);
    });

  return (
    <div className="ed-section">
      <h3>Acciones ({Object.keys(acts).length})</h3>
      <p className="dim small">
        Acciones propias del escenario. Al LLM solo se le ofrecen a quien puede hacerlas; Simcore decide si salen bien (probabilidad) y
        aplica sus consecuencias al objetivo y a quien la hace.
      </p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().toLowerCase().replace(/\s+/g, '_');
          if (n && !BUILTIN_ACTIONS.includes(n)) update((d) => void ((d.actions ??= {})[n] ??= { description: '' }));
          setName('');
        }}
      >
        <input className="input grow" placeholder="Nombre (bite, shoot, treat, barricade…), en una palabra" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">+ Acción</button>
      </form>
      {Object.entries(acts).map(([key, a]) => (
        <article key={key} className="ed-card">
          <div className="row">
            <strong className="grow">{key}</strong>
            <select className="select" value={a.target ?? 'agent'} onChange={(e) => set(key, (x) => void (x.target = e.target.value === 'none' ? 'none' : undefined))}>
              <option value="agent">sobre alguien presente</option>
              <option value="none">sin objetivo</option>
            </select>
            <button
              className="btn"
              title="Eliminar acción"
              onClick={() =>
                update((d) => {
                  delete d.actions![key];
                  if (!Object.keys(d.actions!).length) delete d.actions;
                })
              }
            >
              ✕
            </button>
          </div>
          <input className="input" placeholder="Descripción para el LLM («disparar la escopeta a un zombi»)" value={a.description ?? ''} onChange={(e) => set(key, (x) => void (x.description = e.target.value))} />
          <div className="ed-grid">
            <label>
              Texto si sale bien
              <input className="input" placeholder="muerde a {target}" value={a.message ?? ''} onChange={(e) => set(key, (x) => void (x.message = e.target.value))} />
            </label>
            <label>
              Texto si falla
              <input className="input" placeholder="intenta morder a {target}…" value={a.fail_message ?? ''} onChange={(e) => set(key, (x) => void (x.fail_message = e.target.value))} />
            </label>
            {draft.simulation.rpg && a.check ? (
              <CheckEditor value={a.check} onChange={(c) => set(key, (x) => void (c ? (x.check = c) : delete x.check))} />
            ) : (
              <label>
                Probabilidad de éxito: {Math.round((a.chance ?? 1) * 100)}%
                <input type="range" min={0} max={1} step={0.05} value={a.chance ?? 1} onChange={(e) => set(key, (x) => void (x.chance = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
                {draft.simulation.rpg && (
                  <button type="button" className="btn" onClick={() => set(key, (x) => void (x.check = { attribute: 'dexterity', dc: 12 }))}>
                    🎲 Usar una tirada
                  </button>
                )}
              </label>
            )}
            <AmountsField label="Gasta (aunque falle)" value={a.cost} placeholder="ammo: 1" onChange={(cost) => set(key, (x) => void (x.cost = cost))} />
          </div>
          <details>
            <summary>Quién puede hacerla</summary>
            <RequirementEditor conditions={conditions} value={a.who} onChange={(r) => set(key, (x) => void (x.who = r))} />
          </details>
          {(a.target ?? 'agent') === 'agent' && (
            <>
              <details>
                <summary>A quién se le puede hacer</summary>
                <RequirementEditor conditions={conditions} value={a.target_requires} withItems={false} onChange={(r) => set(key, (x) => void (x.target_requires = r))} />
              </details>
              <details open>
                <summary>Efecto en el objetivo</summary>
                <OutcomeEditor conditions={conditions} value={a.on_target} onChange={(o) => set(key, (x) => void (x.on_target = o))} />
              </details>
            </>
          )}
          <details>
            <summary>Efecto en quien la hace</summary>
            <OutcomeEditor conditions={conditions} value={a.on_self} onChange={(o) => set(key, (x) => void (x.on_self = o))} />
          </details>
        </article>
      ))}
    </div>
  );
}

/** Role-playing rules: d20 + attribute (+ skill) against a difficulty or the target's roll. */
function CheckEditor({ value, onChange }: { value: CheckConfig; onChange: (c: CheckConfig | undefined) => void }) {
  const opposed = !!value.against;
  const put = (patch: Partial<CheckConfig>) => onChange(prune({ ...value, ...patch }) as CheckConfig);
  return (
    <fieldset className="traits check-editor">
      <legend>🎲 Tirada</legend>
      <label className="row">
        <span className="trait-label">Atributo</span>
        <select className="select" value={value.attribute ?? 'dexterity'} onChange={(e) => put({ attribute: e.target.value })}>
          {ATTRIBUTES.map(([k, , long]) => <option key={k} value={k}>{long}</option>)}
        </select>
      </label>
      <label className="row">
        <span className="trait-label">Habilidad</span>
        <select className="select" value={value.skill ?? ''} onChange={(e) => put({ skill: e.target.value || undefined })}>
          <option value="">(ninguna)</option>
          {Object.entries(SKILLS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="row">
        <span className="trait-label">Contra</span>
        <select className="select" value={value.against ?? ''} onChange={(e) => put({ against: e.target.value || undefined, ...(e.target.value ? {} : { against_skill: undefined }) })}>
          <option value="">una dificultad fija</option>
          {ATTRIBUTES.map(([k, , long]) => <option key={k} value={k}>{long} del objetivo</option>)}
        </select>
      </label>
      {opposed ? (
        <label className="row">
          <span className="trait-label">Habilidad del objetivo</span>
          <select className="select" value={value.against_skill ?? ''} onChange={(e) => put({ against_skill: e.target.value || undefined })}>
            <option value="">(ninguna)</option>
            {Object.entries(SKILLS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      ) : (
        <label className="row" title="10 fácil · 12 normal · 15 difícil · 20 casi imposible">
          <span className="trait-label">Dificultad (CD)</span>
          <input className="input" type="number" min={1} max={30} value={value.dc ?? 12} onChange={(e) => put({ dc: Math.max(1, Math.min(30, Number(e.target.value) || 12)) })} />
        </label>
      )}
      <button type="button" className="btn" onClick={() => onChange(undefined)}>
        Usar probabilidad fija
      </button>
    </fieldset>
  );
}
